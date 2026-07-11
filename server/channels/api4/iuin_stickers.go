// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/color/palette"
	"image/draw"
	"image/gif"
	"image/jpeg"
	"image/png"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
	"github.com/mattermost/mattermost/server/v8/channels/app/imaging"
	_ "golang.org/x/image/webp"
)

const (
	iuinImageAssetMaxBytes      = 5 * 1024 * 1024
	iuinImageUploadReadLimit    = 25 * 1024 * 1024
	iuinRecentEmojiLimit        = 100
	iuinImageMaxStaticDimension = 1024
	iuinImageMaxGIFDimension    = 512
)

type iuinRecentEmojiRequest struct {
	EmojiName string `json:"emoji_name"`
}

type iuinImageAssetData struct {
	Content  []byte
	MimeType string
	Width    int
	Height   int
	SHA256   string
	Ext      string
}

func (api *API) InitIuinEmojiCompatibility() {
	iuin := api.BaseRoutes.APIRoot.PathPrefix("/iuin").Subrouter()

	// Legacy sticker URLs remain as protocol adapters only. All active reads and
	// writes use the unified Emoji asset/library tables.
	iuin.Handle("/stickers", api.APISessionRequired(listIuinEmojis)).Methods(http.MethodGet)
	iuin.Handle("/stickers", api.APISessionRequired(uploadIuinEmoji, handlerParamFileAPI)).Methods(http.MethodPost)
	iuin.Handle("/stickers/{sticker_id:[A-Za-z0-9]+}/favorite", api.APISessionRequired(addIuinEmojiToLibrary)).Methods(http.MethodPost)
	iuin.Handle("/stickers/{sticker_id:[A-Za-z0-9]+}/favorite", api.APISessionRequired(removeIuinEmojiFromLibrary)).Methods(http.MethodDelete)
	iuin.Handle("/stickers/{sticker_id:[A-Za-z0-9]+}/send", api.APISessionRequired(sendIuinEmoji)).Methods(http.MethodPost)
	iuin.Handle("/stickers/{sticker_id:[A-Za-z0-9]+}/image", api.APISessionRequiredTrustRequester(getIuinEmojiImage)).Methods(http.MethodGet)

	iuin.Handle("/recent_emojis", api.APISessionRequired(getIuinRecentEmojis)).Methods(http.MethodGet)
	iuin.Handle("/recent_emojis", api.APISessionRequired(postIuinRecentEmoji)).Methods(http.MethodPost)
}

func getIuinRecentEmojis(c *Context, w http.ResponseWriter, r *http.Request) {
	emojis, appErr := selectIuinRecentEmojis(r.Context(), c.App.Srv().Store().GetInternalReplicaDB(), c.AppContext.Session().UserId)
	if appErr != nil {
		c.Err = appErr
		return
	}

	if err := json.NewEncoder(w).Encode(emojis); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func postIuinRecentEmoji(c *Context, w http.ResponseWriter, r *http.Request) {
	var req iuinRecentEmojiRequest
	if jsonErr := json.NewDecoder(r.Body).Decode(&req); jsonErr != nil {
		c.SetInvalidParamWithErr("request", jsonErr)
		return
	}

	if appErr := recordIuinRecentEmoji(r.Context(), c.App.Srv().Store().GetInternalMasterDB(), c.AppContext.Session().UserId, req.EmojiName); appErr != nil {
		c.Err = appErr
		return
	}

	ReturnStatusOK(w)
}

func recordIuinRecentEmoji(ctx context.Context, db *sql.DB, userID string, emojiName string) *model.AppError {
	emojiName = strings.TrimSpace(emojiName)
	if emojiName == "" || len(emojiName) > 128 {
		return model.NewAppError("recordIuinRecentEmoji", "api.iuin_recent_emojis.invalid", nil, "", http.StatusBadRequest)
	}

	// Status images have their own lifecycle and must never leak into the
	// message/reaction emoji history. The status_ prefix covers legacy status
	// uploads that were stored as custom emoji before the stores were split.
	if strings.HasPrefix(emojiName, "status_") || strings.HasPrefix(emojiName, iuinStatusImageTokenPrefix) {
		return nil
	}

	isSupportedEmoji := model.IsSystemEmojiName(emojiName) || emojiName == "mattermost"
	if !isSupportedEmoji {
		if err := db.QueryRowContext(ctx, `
			SELECT EXISTS (
				SELECT 1
				  FROM Emoji
				 WHERE Name = $1 AND DeleteAt = 0
			)`, emojiName).Scan(&isSupportedEmoji); err != nil {
			return newIuinRecentEmojiAppError("recordIuinRecentEmoji.validate", http.StatusInternalServerError, err)
		}
	}
	if !isSupportedEmoji {
		return nil
	}

	now := model.GetMillis()
	if _, err := db.ExecContext(ctx, `
		INSERT INTO IuinRecentEmojis (UserId, EmojiName, UpdateAt)
		     VALUES ($1, $2, $3)
		ON CONFLICT (UserId, EmojiName)
		DO UPDATE SET UpdateAt = EXCLUDED.UpdateAt`, userID, emojiName, now); err != nil {
		return newIuinRecentEmojiAppError("recordIuinRecentEmoji.upsert", http.StatusInternalServerError, err)
	}

	if _, err := db.ExecContext(ctx, `
		DELETE FROM IuinRecentEmojis
		 WHERE UserId = $1
		   AND EmojiName IN (
		       SELECT EmojiName
		         FROM IuinRecentEmojis
		        WHERE UserId = $1
		     ORDER BY UpdateAt DESC
		       OFFSET $2
		   )`, userID, iuinRecentEmojiLimit); err != nil {
		return newIuinRecentEmojiAppError("recordIuinRecentEmoji.trim", http.StatusInternalServerError, err)
	}

	return nil
}

func selectIuinRecentEmojis(ctx context.Context, db *sql.DB, userID string) ([]string, *model.AppError) {
	rows, err := db.QueryContext(ctx, `
		SELECT EmojiName
		  FROM IuinRecentEmojis
		 WHERE UserId = $1
	  ORDER BY UpdateAt DESC
		 LIMIT $2`, userID, iuinRecentEmojiLimit)
	if err != nil {
		return nil, newIuinRecentEmojiAppError("selectIuinRecentEmojis", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	emojis := []string{}
	for rows.Next() {
		var emoji string
		if err := rows.Scan(&emoji); err != nil {
			return nil, newIuinRecentEmojiAppError("selectIuinRecentEmojis.scan", http.StatusInternalServerError, err)
		}
		emojis = append(emojis, emoji)
	}
	if err := rows.Err(); err != nil {
		return nil, newIuinRecentEmojiAppError("selectIuinRecentEmojis.rows", http.StatusInternalServerError, err)
	}

	return emojis, nil
}

func firstIuinImageUploadFile(form *multipart.Form) *multipart.FileHeader {
	if form == nil || form.File == nil {
		return nil
	}
	if files := form.File["image"]; len(files) > 0 {
		return files[0]
	}
	if files := form.File["file"]; len(files) > 0 {
		return files[0]
	}
	return nil
}

func sanitizeIuinImageFilename(filename string) string {
	filename = filepath.Base(strings.TrimSpace(filename))
	if filename == "." || filename == "/" || filename == "" {
		return "sticker"
	}
	if len(filename) > 255 {
		return filename[:255]
	}
	return filename
}

func processIuinImageAsset(data []byte) (iuinImageAssetData, error) {
	if len(data) == 0 {
		return iuinImageAssetData{}, errors.New("empty file")
	}

	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return iuinImageAssetData{}, fmt.Errorf("unsupported image: %w", err)
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		return iuinImageAssetData{}, errors.New("invalid image size")
	}

	if format == "gif" {
		content, width, height, err := processIuinImageAssetGIF(data, cfg.Width, cfg.Height)
		if err != nil {
			return iuinImageAssetData{}, err
		}
		return makeIuinImageAssetData(content, "image/gif", width, height, "gif"), nil
	}

	content, mimeType, width, height, ext, err := processIuinImageAssetStatic(data, format, cfg.Width, cfg.Height)
	if err != nil {
		return iuinImageAssetData{}, err
	}
	return makeIuinImageAssetData(content, mimeType, width, height, ext), nil
}

func processIuinImageAssetStatic(data []byte, format string, width int, height int) ([]byte, string, int, int, string, error) {
	if len(data) <= iuinImageAssetMaxBytes && maxInt(width, height) <= iuinImageMaxStaticDimension {
		if mimeType, ext, ok := iuinImageFormatToMimeExt(format); ok {
			return data, mimeType, width, height, ext, nil
		}
	}

	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, "", 0, 0, "", fmt.Errorf("decode image: %w", err)
	}

	hasAlpha := iuinImageHasAlpha(img)
	baseMax := minInt(maxInt(width, height), iuinImageMaxStaticDimension)
	scaleSteps := []float64{1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25}
	jpegQualities := []int{92, 86, 80, 74, 68}

	var last []byte
	for _, scale := range scaleSteps {
		targetMax := maxInt(96, int(float64(baseMax)*scale))
		candidate := imaging.Fit(img, targetMax, targetMax)
		bounds := candidate.Bounds()

		if hasAlpha {
			buf := &bytes.Buffer{}
			if err := png.Encode(buf, candidate); err != nil {
				return nil, "", 0, 0, "", fmt.Errorf("encode png: %w", err)
			}
			last = buf.Bytes()
			if len(last) <= iuinImageAssetMaxBytes {
				return last, "image/png", bounds.Dx(), bounds.Dy(), "png", nil
			}
		}

		var jpegImg image.Image = candidate
		if hasAlpha {
			jpegImg = iuinFlattenImage(candidate)
		}
		for _, quality := range jpegQualities {
			buf := &bytes.Buffer{}
			if err := jpeg.Encode(buf, jpegImg, &jpeg.Options{Quality: quality}); err != nil {
				return nil, "", 0, 0, "", fmt.Errorf("encode jpeg: %w", err)
			}
			last = buf.Bytes()
			if len(last) <= iuinImageAssetMaxBytes {
				return last, "image/jpeg", bounds.Dx(), bounds.Dy(), "jpg", nil
			}
		}
	}

	return nil, "", 0, 0, "", fmt.Errorf("image is still larger than %d bytes after compression, last size %d bytes", iuinImageAssetMaxBytes, len(last))
}

func processIuinImageAssetGIF(data []byte, width int, height int) ([]byte, int, int, error) {
	if len(data) <= iuinImageAssetMaxBytes && maxInt(width, height) <= iuinImageMaxGIFDimension {
		return data, width, height, nil
	}

	src, err := gif.DecodeAll(bytes.NewReader(data))
	if err != nil {
		return nil, 0, 0, fmt.Errorf("decode gif: %w", err)
	}

	baseMax := minInt(maxInt(width, height), iuinImageMaxGIFDimension)
	frameSteps := []int{1, 2, 3, 4, 6}
	scaleSteps := []float64{1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3}

	var lastSize int
	for _, frameStep := range frameSteps {
		for _, scale := range scaleSteps {
			targetMax := maxInt(96, int(float64(baseMax)*scale))
			content, outWidth, outHeight, err := encodeIuinImageAssetGIF(src, targetMax, frameStep)
			if err != nil {
				return nil, 0, 0, err
			}
			lastSize = len(content)
			if lastSize <= iuinImageAssetMaxBytes {
				return content, outWidth, outHeight, nil
			}
		}
	}

	return nil, 0, 0, fmt.Errorf("gif is still larger than %d bytes after compression, last size %d bytes", iuinImageAssetMaxBytes, lastSize)
}

func encodeIuinImageAssetGIF(src *gif.GIF, targetMax int, frameStep int) ([]byte, int, int, error) {
	if len(src.Image) == 0 {
		return nil, 0, 0, errors.New("empty gif")
	}

	sourceWidth := src.Config.Width
	sourceHeight := src.Config.Height
	if sourceWidth <= 0 || sourceHeight <= 0 {
		sourceWidth = src.Image[0].Bounds().Dx()
		sourceHeight = src.Image[0].Bounds().Dy()
	}

	canvas := image.NewRGBA(image.Rect(0, 0, sourceWidth, sourceHeight))
	out := &gif.GIF{LoopCount: src.LoopCount}
	pendingDelay := 0

	for i, frame := range src.Image {
		delay := 1
		if i < len(src.Delay) && src.Delay[i] > 0 {
			delay = src.Delay[i]
		}
		pendingDelay += delay

		draw.Draw(canvas, frame.Bounds(), frame, frame.Bounds().Min, draw.Over)
		shouldKeep := i%frameStep == 0 || i == len(src.Image)-1
		if !shouldKeep {
			continue
		}

		resized := imaging.Fit(canvas, targetMax, targetMax)
		bounds := resized.Bounds()
		out.Image = append(out.Image, iuinImageToPaletted(resized))
		out.Delay = append(out.Delay, pendingDelay)
		out.Disposal = append(out.Disposal, gif.DisposalNone)
		out.Config.Width = bounds.Dx()
		out.Config.Height = bounds.Dy()
		pendingDelay = 0
	}

	buf := &bytes.Buffer{}
	if err := gif.EncodeAll(buf, out); err != nil {
		return nil, 0, 0, fmt.Errorf("encode gif: %w", err)
	}

	return buf.Bytes(), out.Config.Width, out.Config.Height, nil
}

func makeIuinImageAssetData(content []byte, mimeType string, width int, height int, ext string) iuinImageAssetData {
	sum := sha256.Sum256(content)
	return iuinImageAssetData{
		Content:  content,
		MimeType: mimeType,
		Width:    width,
		Height:   height,
		SHA256:   fmt.Sprintf("%x", sum[:]),
		Ext:      ext,
	}
}

func iuinImageFormatToMimeExt(format string) (string, string, bool) {
	switch format {
	case "jpeg":
		return "image/jpeg", "jpg", true
	case "png":
		return "image/png", "png", true
	case "webp":
		return "image/webp", "webp", true
	default:
		return "", "", false
	}
}

func iuinImageHasAlpha(img image.Image) bool {
	type opaque interface {
		Opaque() bool
	}
	if o, ok := img.(opaque); ok {
		return !o.Opaque()
	}
	return true
}

func iuinFlattenImage(img image.Image) image.Image {
	bounds := img.Bounds()
	flattened := image.NewRGBA(bounds)
	draw.Draw(flattened, bounds, &image.Uniform{C: color.White}, image.Point{}, draw.Src)
	draw.Draw(flattened, bounds, img, bounds.Min, draw.Over)
	return flattened
}

func iuinImageToPaletted(img image.Image) *image.Paletted {
	bounds := img.Bounds()
	pm := image.NewPaletted(bounds, palette.Plan9)
	draw.FloydSteinberg.Draw(pm, bounds, img, image.Point{})
	return pm
}

func minInt(a int, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
}

func newIuinRecentEmojiAppError(where string, statusCode int, err error) *model.AppError {
	return model.NewAppError(where, "api.iuin_recent_emojis.storage_error", nil, "", statusCode).Wrap(err)
}
