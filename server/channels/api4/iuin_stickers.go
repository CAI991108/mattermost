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
	"io"
	"mime/multipart"
	"net/http"
	pathpkg "path"
	"path/filepath"
	"strings"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
	"github.com/mattermost/mattermost/server/v8/channels/app/imaging"
	_ "golang.org/x/image/webp"
)

const (
	iuinStickerStorageRoot         = "iuin_stickers"
	iuinStickerMaxBytes            = 5 * 1024 * 1024
	iuinStickerUploadReadLimit     = 25 * 1024 * 1024
	iuinStickerMaxFavoritesPerUser = 500
	iuinRecentEmojiLimit           = 100
	iuinStickerMaxStaticDimension  = 1024
	iuinStickerMaxGIFDimension     = 512
)

type iuinStickerRow struct {
	ID            string
	CreatorUserID string
	FilePath      string
	Filename      string
	MimeType      string
	SizeBytes     int64
	Width         int
	Height        int
	SHA256        string
	CreateAt      int64
	UpdateAt      int64
	FavoriteAt    int64
}

type iuinStickerPayload struct {
	ID            string `json:"id"`
	CreatorUserID string `json:"creatorUserId"`
	Filename      string `json:"filename"`
	MimeType      string `json:"mimeType"`
	SizeBytes     int64  `json:"sizeBytes"`
	Width         int    `json:"width"`
	Height        int    `json:"height"`
	SHA256        string `json:"sha256"`
	ImageURL      string `json:"imageUrl"`
	CreatedAt     int64  `json:"createdAt"`
	UpdatedAt     int64  `json:"updatedAt"`
	FavoriteAt    int64  `json:"favoriteAt"`
}

type iuinStickerSendRequest struct {
	ChannelID string `json:"channel_id"`
	RootID    string `json:"root_id"`
}

type iuinRecentEmojiRequest struct {
	EmojiName string `json:"emoji_name"`
}

type iuinStickerImageData struct {
	Content  []byte
	MimeType string
	Width    int
	Height   int
	SHA256   string
	Ext      string
}

func (api *API) InitIuinStickers() {
	iuin := api.BaseRoutes.APIRoot.PathPrefix("/iuin").Subrouter()

	iuin.Handle("/stickers", api.APISessionRequired(listIuinStickers)).Methods(http.MethodGet)
	iuin.Handle("/stickers", api.APISessionRequired(uploadIuinSticker, handlerParamFileAPI)).Methods(http.MethodPost)
	iuin.Handle("/stickers/{sticker_id:[A-Za-z0-9]+}/favorite", api.APISessionRequired(favoriteIuinSticker)).Methods(http.MethodPost)
	iuin.Handle("/stickers/{sticker_id:[A-Za-z0-9]+}/favorite", api.APISessionRequired(deleteIuinStickerFavorite)).Methods(http.MethodDelete)
	iuin.Handle("/stickers/{sticker_id:[A-Za-z0-9]+}/send", api.APISessionRequired(sendIuinSticker)).Methods(http.MethodPost)
	iuin.Handle("/stickers/{sticker_id:[A-Za-z0-9]+}/image", api.APISessionRequiredTrustRequester(getIuinStickerImage)).Methods(http.MethodGet)

	iuin.Handle("/recent_emojis", api.APISessionRequired(getIuinRecentEmojis)).Methods(http.MethodGet)
	iuin.Handle("/recent_emojis", api.APISessionRequired(postIuinRecentEmoji)).Methods(http.MethodPost)
}

func listIuinStickers(c *Context, w http.ResponseWriter, r *http.Request) {
	rows, appErr := selectIuinUserStickers(r.Context(), c.App.Srv().Store().GetInternalReplicaDB(), c.AppContext.Session().UserId)
	if appErr != nil {
		c.Err = appErr
		return
	}

	payload := make([]iuinStickerPayload, 0, len(rows))
	for _, row := range rows {
		payload = append(payload, makeIuinStickerPayload(row))
	}

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func uploadIuinSticker(c *Context, w http.ResponseWriter, r *http.Request) {
	defer func() {
		if _, err := io.Copy(io.Discard, r.Body); err != nil {
			c.Logger.Warn("Error while discarding request body", mlog.Err(err))
		}
	}()

	r.Body = http.MaxBytesReader(w, r.Body, iuinStickerUploadReadLimit)
	if err := r.ParseMultipartForm(iuinStickerUploadReadLimit); err != nil {
		c.Err = model.NewAppError("uploadIuinSticker", "api.iuin_stickers.parse.app_error", nil, "", http.StatusBadRequest).Wrap(err)
		return
	}

	fileHeader := firstIuinStickerUploadFile(r.MultipartForm)
	if fileHeader == nil {
		c.SetInvalidParam("image")
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.Err = model.NewAppError("uploadIuinSticker", "api.iuin_stickers.open.app_error", nil, "", http.StatusBadRequest).Wrap(err)
		return
	}
	defer file.Close()

	raw, err := io.ReadAll(file)
	if err != nil {
		c.Err = model.NewAppError("uploadIuinSticker", "api.iuin_stickers.read.app_error", nil, "", http.StatusBadRequest).Wrap(err)
		return
	}

	processed, err := processIuinStickerImage(raw)
	if err != nil {
		c.Err = model.NewAppError("uploadIuinSticker", "api.iuin_stickers.process.app_error", nil, err.Error(), http.StatusBadRequest).Wrap(err)
		return
	}

	db := c.App.Srv().Store().GetInternalMasterDB()
	sticker, appErr := getOrCreateIuinSticker(r.Context(), c, db, c.AppContext.Session().UserId, sanitizeIuinStickerFilename(fileHeader.Filename), processed)
	if appErr != nil {
		c.Err = appErr
		return
	}

	if appErr := addIuinStickerFavorite(r.Context(), db, c.AppContext.Session().UserId, sticker.ID); appErr != nil {
		c.Err = appErr
		return
	}

	sticker, appErr = selectIuinStickerForUser(r.Context(), db, c.AppContext.Session().UserId, sticker.ID)
	if appErr != nil {
		c.Err = appErr
		return
	}

	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(makeIuinStickerPayload(*sticker)); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func favoriteIuinSticker(c *Context, w http.ResponseWriter, r *http.Request) {
	stickerID := mux.Vars(r)["sticker_id"]
	if !model.IsValidId(stickerID) {
		c.SetInvalidURLParam("sticker_id")
		return
	}

	db := c.App.Srv().Store().GetInternalMasterDB()
	if _, appErr := selectIuinStickerByID(r.Context(), db, stickerID); appErr != nil {
		c.Err = appErr
		return
	}

	if appErr := addIuinStickerFavorite(r.Context(), db, c.AppContext.Session().UserId, stickerID); appErr != nil {
		c.Err = appErr
		return
	}

	sticker, appErr := selectIuinStickerForUser(r.Context(), db, c.AppContext.Session().UserId, stickerID)
	if appErr != nil {
		c.Err = appErr
		return
	}

	if err := json.NewEncoder(w).Encode(makeIuinStickerPayload(*sticker)); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func deleteIuinStickerFavorite(c *Context, w http.ResponseWriter, r *http.Request) {
	stickerID := mux.Vars(r)["sticker_id"]
	if !model.IsValidId(stickerID) {
		c.SetInvalidURLParam("sticker_id")
		return
	}

	now := model.GetMillis()
	if _, err := c.App.Srv().Store().GetInternalMasterDB().ExecContext(r.Context(), `
		UPDATE IuinUserStickers
		   SET DeleteAt = $1, UpdateAt = $1
		 WHERE UserId = $2
		   AND StickerId = $3
		   AND DeleteAt = 0`, now, c.AppContext.Session().UserId, stickerID); err != nil {
		c.Err = newIuinStickerAppError("deleteIuinStickerFavorite", http.StatusInternalServerError, err)
		return
	}

	ReturnStatusOK(w)
}

func sendIuinSticker(c *Context, w http.ResponseWriter, r *http.Request) {
	stickerID := mux.Vars(r)["sticker_id"]
	if !model.IsValidId(stickerID) {
		c.SetInvalidURLParam("sticker_id")
		return
	}

	var req iuinStickerSendRequest
	if jsonErr := json.NewDecoder(r.Body).Decode(&req); jsonErr != nil {
		c.SetInvalidParamWithErr("request", jsonErr)
		return
	}
	if !model.IsValidId(req.ChannelID) {
		c.SetInvalidParam("channel_id")
		return
	}
	if req.RootID != "" && !model.IsValidId(req.RootID) {
		c.SetInvalidParam("root_id")
		return
	}

	db := c.App.Srv().Store().GetInternalReplicaDB()
	if ok, appErr := iuinUserHasSticker(r.Context(), db, c.AppContext.Session().UserId, stickerID); appErr != nil {
		c.Err = appErr
		return
	} else if !ok {
		c.Err = model.NewAppError("sendIuinSticker", "api.iuin_stickers.not_favorited", nil, "", http.StatusForbidden)
		return
	}

	sticker, appErr := selectIuinStickerByID(r.Context(), db, stickerID)
	if appErr != nil {
		c.Err = appErr
		return
	}

	post := &model.Post{
		UserId:    c.AppContext.Session().UserId,
		ChannelId: req.ChannelID,
		RootId:    req.RootID,
		Message:   "",
		Props: model.StringInterface{
			"iuin_sticker_id":     sticker.ID,
			"iuin_sticker_url":    iuinStickerImageURL(sticker.ID),
			"iuin_sticker_mime":   sticker.MimeType,
			"iuin_sticker_width":  sticker.Width,
			"iuin_sticker_height": sticker.Height,
		},
	}

	createPostChecks("sendIuinSticker", c, post)
	if c.Err != nil {
		return
	}

	rp, isMemberForPreviews, appErr := c.App.CreatePostAsUser(c.AppContext, c.App.PostWithProxyRemovedFromImageURLs(post), c.AppContext.Session().Id, true)
	if appErr != nil {
		c.Err = appErr
		return
	}
	if !isMemberForPreviews {
		previewPost := rp.GetPreviewPost()
		if previewPost != nil {
			c.Logger.Debug("Created sticker post preview for non-channel member access", mlog.String("preview_post_id", previewPost.Post.Id))
		}
	}

	c.App.SetStatusOnline(c.AppContext.Session().UserId, false)
	c.App.Srv().Platform().UpdateLastActivityAtIfNeeded(*c.AppContext.Session())
	c.ExtendSessionExpiryIfNeeded(w, r)

	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(rp); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func getIuinStickerImage(c *Context, w http.ResponseWriter, r *http.Request) {
	stickerID := mux.Vars(r)["sticker_id"]
	if !model.IsValidId(stickerID) {
		c.SetInvalidURLParam("sticker_id")
		return
	}

	sticker, appErr := selectIuinStickerByID(r.Context(), c.App.Srv().Store().GetInternalReplicaDB(), stickerID)
	if appErr != nil {
		c.Err = appErr
		return
	}

	data, appErr := c.App.ReadFile(sticker.FilePath)
	if appErr != nil {
		c.Err = newIuinStickerAppError("getIuinStickerImage.read", http.StatusNotFound, appErr)
		return
	}

	w.Header().Set("Content-Type", sticker.MimeType)
	w.Header().Set("Cache-Control", "private, max-age=86400")
	if _, err := w.Write(data); err != nil {
		c.Logger.Warn("Error while writing sticker image", mlog.Err(err))
	}
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
	if !model.IsSystemEmojiName(emojiName) {
		return nil
	}

	now := model.GetMillis()
	if _, err := db.ExecContext(ctx, `
		INSERT INTO IuinRecentEmojis (UserId, EmojiName, UpdateAt)
		     VALUES ($1, $2, $3)
		ON CONFLICT (UserId, EmojiName)
		DO UPDATE SET UpdateAt = EXCLUDED.UpdateAt`, userID, emojiName, now); err != nil {
		return newIuinStickerAppError("recordIuinRecentEmoji.upsert", http.StatusInternalServerError, err)
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
		return newIuinStickerAppError("recordIuinRecentEmoji.trim", http.StatusInternalServerError, err)
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
		return nil, newIuinStickerAppError("selectIuinRecentEmojis", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	emojis := []string{}
	for rows.Next() {
		var emoji string
		if err := rows.Scan(&emoji); err != nil {
			return nil, newIuinStickerAppError("selectIuinRecentEmojis.scan", http.StatusInternalServerError, err)
		}
		emojis = append(emojis, emoji)
	}
	if err := rows.Err(); err != nil {
		return nil, newIuinStickerAppError("selectIuinRecentEmojis.rows", http.StatusInternalServerError, err)
	}

	return emojis, nil
}

func firstIuinStickerUploadFile(form *multipart.Form) *multipart.FileHeader {
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

func getOrCreateIuinSticker(ctx context.Context, c *Context, db *sql.DB, userID string, filename string, data iuinStickerImageData) (*iuinStickerRow, *model.AppError) {
	if existing, appErr := selectIuinStickerBySHA(ctx, db, data.SHA256); appErr == nil && existing != nil {
		return existing, nil
	} else if appErr != nil && appErr.StatusCode != http.StatusNotFound {
		return nil, appErr
	}

	now := model.GetMillis()
	sticker := &iuinStickerRow{
		ID:            model.NewId(),
		CreatorUserID: userID,
		Filename:      filename,
		MimeType:      data.MimeType,
		SizeBytes:     int64(len(data.Content)),
		Width:         data.Width,
		Height:        data.Height,
		SHA256:        data.SHA256,
		CreateAt:      now,
		UpdateAt:      now,
	}
	sticker.FilePath = pathpkg.Join(iuinStickerStorageRoot, sticker.ID, "original."+data.Ext)

	if _, appErr := c.App.WriteFile(bytes.NewReader(data.Content), sticker.FilePath); appErr != nil {
		return nil, newIuinStickerAppError("getOrCreateIuinSticker.write", http.StatusInternalServerError, appErr)
	}

	if _, err := db.ExecContext(ctx, `
		INSERT INTO IuinStickers
		    (Id, CreatorUserId, FilePath, Filename, MimeType, SizeBytes, Width, Height, Sha256, CreateAt, UpdateAt, DeleteAt)
		VALUES
		    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0)`,
		sticker.ID, sticker.CreatorUserID, sticker.FilePath, sticker.Filename, sticker.MimeType, sticker.SizeBytes, sticker.Width, sticker.Height, sticker.SHA256, sticker.CreateAt, sticker.UpdateAt); err != nil {
		if removeErr := c.App.RemoveFile(sticker.FilePath); removeErr != nil {
			c.Logger.Warn("Failed to clean up sticker file after DB insert failure", mlog.String("path", sticker.FilePath), mlog.Err(removeErr))
		}
		return nil, newIuinStickerAppError("getOrCreateIuinSticker.insert", http.StatusInternalServerError, err)
	}

	return sticker, nil
}

func addIuinStickerFavorite(ctx context.Context, db *sql.DB, userID string, stickerID string) *model.AppError {
	active, appErr := iuinUserHasSticker(ctx, db, userID, stickerID)
	if appErr != nil {
		return appErr
	}
	if !active {
		var count int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM IuinUserStickers WHERE UserId = $1 AND DeleteAt = 0`, userID).Scan(&count); err != nil {
			return newIuinStickerAppError("addIuinStickerFavorite.count", http.StatusInternalServerError, err)
		}
		if count >= iuinStickerMaxFavoritesPerUser {
			return model.NewAppError("addIuinStickerFavorite", "api.iuin_stickers.favorite_limit", map[string]any{"Limit": iuinStickerMaxFavoritesPerUser}, "", http.StatusBadRequest)
		}
	}

	now := model.GetMillis()
	if _, err := db.ExecContext(ctx, `
		INSERT INTO IuinUserStickers (UserId, StickerId, SortOrder, CreateAt, UpdateAt, DeleteAt)
		     VALUES ($1, $2, $3, $3, $3, 0)
		ON CONFLICT (UserId, StickerId)
		DO UPDATE SET SortOrder = EXCLUDED.SortOrder,
		              UpdateAt = EXCLUDED.UpdateAt,
		              DeleteAt = 0`, userID, stickerID, now); err != nil {
		return newIuinStickerAppError("addIuinStickerFavorite.upsert", http.StatusInternalServerError, err)
	}

	return nil
}

func iuinUserHasSticker(ctx context.Context, db *sql.DB, userID string, stickerID string) (bool, *model.AppError) {
	var exists bool
	if err := db.QueryRowContext(ctx, `
		SELECT EXISTS(
		    SELECT 1
		      FROM IuinUserStickers
		     WHERE UserId = $1
		       AND StickerId = $2
		       AND DeleteAt = 0
		)`, userID, stickerID).Scan(&exists); err != nil {
		return false, newIuinStickerAppError("iuinUserHasSticker", http.StatusInternalServerError, err)
	}

	return exists, nil
}

func selectIuinUserStickers(ctx context.Context, db *sql.DB, userID string) ([]iuinStickerRow, *model.AppError) {
	rows, err := db.QueryContext(ctx, `
		SELECT s.Id, s.CreatorUserId, s.FilePath, s.Filename, s.MimeType, s.SizeBytes, s.Width, s.Height, s.Sha256, s.CreateAt, s.UpdateAt, us.UpdateAt
		  FROM IuinUserStickers us
		  JOIN IuinStickers s ON s.Id = us.StickerId AND s.DeleteAt = 0
		 WHERE us.UserId = $1
		   AND us.DeleteAt = 0
	  ORDER BY us.SortOrder ASC, us.UpdateAt ASC`, userID)
	if err != nil {
		return nil, newIuinStickerAppError("selectIuinUserStickers", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	stickers := []iuinStickerRow{}
	for rows.Next() {
		var row iuinStickerRow
		if err := rows.Scan(&row.ID, &row.CreatorUserID, &row.FilePath, &row.Filename, &row.MimeType, &row.SizeBytes, &row.Width, &row.Height, &row.SHA256, &row.CreateAt, &row.UpdateAt, &row.FavoriteAt); err != nil {
			return nil, newIuinStickerAppError("selectIuinUserStickers.scan", http.StatusInternalServerError, err)
		}
		stickers = append(stickers, row)
	}
	if err := rows.Err(); err != nil {
		return nil, newIuinStickerAppError("selectIuinUserStickers.rows", http.StatusInternalServerError, err)
	}

	return stickers, nil
}

func selectIuinStickerForUser(ctx context.Context, db *sql.DB, userID string, stickerID string) (*iuinStickerRow, *model.AppError) {
	var row iuinStickerRow
	if err := db.QueryRowContext(ctx, `
		SELECT s.Id, s.CreatorUserId, s.FilePath, s.Filename, s.MimeType, s.SizeBytes, s.Width, s.Height, s.Sha256, s.CreateAt, s.UpdateAt, us.UpdateAt
		  FROM IuinUserStickers us
		  JOIN IuinStickers s ON s.Id = us.StickerId AND s.DeleteAt = 0
		 WHERE us.UserId = $1
		   AND us.StickerId = $2
		   AND us.DeleteAt = 0`, userID, stickerID).
		Scan(&row.ID, &row.CreatorUserID, &row.FilePath, &row.Filename, &row.MimeType, &row.SizeBytes, &row.Width, &row.Height, &row.SHA256, &row.CreateAt, &row.UpdateAt, &row.FavoriteAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, model.NewAppError("selectIuinStickerForUser", "api.iuin_stickers.not_found", nil, "", http.StatusNotFound).Wrap(err)
		}
		return nil, newIuinStickerAppError("selectIuinStickerForUser", http.StatusInternalServerError, err)
	}

	return &row, nil
}

func selectIuinStickerByID(ctx context.Context, db *sql.DB, stickerID string) (*iuinStickerRow, *model.AppError) {
	var row iuinStickerRow
	if err := db.QueryRowContext(ctx, `
		SELECT Id, CreatorUserId, FilePath, Filename, MimeType, SizeBytes, Width, Height, Sha256, CreateAt, UpdateAt, 0
		  FROM IuinStickers
		 WHERE Id = $1
		   AND DeleteAt = 0`, stickerID).
		Scan(&row.ID, &row.CreatorUserID, &row.FilePath, &row.Filename, &row.MimeType, &row.SizeBytes, &row.Width, &row.Height, &row.SHA256, &row.CreateAt, &row.UpdateAt, &row.FavoriteAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, model.NewAppError("selectIuinStickerByID", "api.iuin_stickers.not_found", nil, "", http.StatusNotFound).Wrap(err)
		}
		return nil, newIuinStickerAppError("selectIuinStickerByID", http.StatusInternalServerError, err)
	}

	return &row, nil
}

func selectIuinStickerBySHA(ctx context.Context, db *sql.DB, sha string) (*iuinStickerRow, *model.AppError) {
	var row iuinStickerRow
	if err := db.QueryRowContext(ctx, `
		SELECT Id, CreatorUserId, FilePath, Filename, MimeType, SizeBytes, Width, Height, Sha256, CreateAt, UpdateAt, 0
		  FROM IuinStickers
		 WHERE Sha256 = $1
		   AND DeleteAt = 0`, sha).
		Scan(&row.ID, &row.CreatorUserID, &row.FilePath, &row.Filename, &row.MimeType, &row.SizeBytes, &row.Width, &row.Height, &row.SHA256, &row.CreateAt, &row.UpdateAt, &row.FavoriteAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, model.NewAppError("selectIuinStickerBySHA", "api.iuin_stickers.not_found", nil, "", http.StatusNotFound).Wrap(err)
		}
		return nil, newIuinStickerAppError("selectIuinStickerBySHA", http.StatusInternalServerError, err)
	}

	return &row, nil
}

func makeIuinStickerPayload(row iuinStickerRow) iuinStickerPayload {
	return iuinStickerPayload{
		ID:            row.ID,
		CreatorUserID: row.CreatorUserID,
		Filename:      row.Filename,
		MimeType:      row.MimeType,
		SizeBytes:     row.SizeBytes,
		Width:         row.Width,
		Height:        row.Height,
		SHA256:        row.SHA256,
		ImageURL:      iuinStickerImageURL(row.ID),
		CreatedAt:     row.CreateAt,
		UpdatedAt:     row.UpdateAt,
		FavoriteAt:    row.FavoriteAt,
	}
}

func iuinStickerImageURL(stickerID string) string {
	return "/api/v4/iuin/stickers/" + stickerID + "/image"
}

func sanitizeIuinStickerFilename(filename string) string {
	filename = filepath.Base(strings.TrimSpace(filename))
	if filename == "." || filename == "/" || filename == "" {
		return "sticker"
	}
	if len(filename) > 255 {
		return filename[:255]
	}
	return filename
}

func processIuinStickerImage(data []byte) (iuinStickerImageData, error) {
	if len(data) == 0 {
		return iuinStickerImageData{}, errors.New("empty file")
	}

	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return iuinStickerImageData{}, fmt.Errorf("unsupported image: %w", err)
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		return iuinStickerImageData{}, errors.New("invalid image size")
	}

	if format == "gif" {
		content, width, height, err := processIuinStickerGIF(data, cfg.Width, cfg.Height)
		if err != nil {
			return iuinStickerImageData{}, err
		}
		return makeIuinStickerImageData(content, "image/gif", width, height, "gif"), nil
	}

	content, mimeType, width, height, ext, err := processIuinStickerStaticImage(data, format, cfg.Width, cfg.Height)
	if err != nil {
		return iuinStickerImageData{}, err
	}
	return makeIuinStickerImageData(content, mimeType, width, height, ext), nil
}

func processIuinStickerStaticImage(data []byte, format string, width int, height int) ([]byte, string, int, int, string, error) {
	if len(data) <= iuinStickerMaxBytes && maxInt(width, height) <= iuinStickerMaxStaticDimension {
		if mimeType, ext, ok := iuinStickerFormatToMimeExt(format); ok {
			return data, mimeType, width, height, ext, nil
		}
	}

	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, "", 0, 0, "", fmt.Errorf("decode image: %w", err)
	}

	hasAlpha := iuinStickerImageHasAlpha(img)
	baseMax := minInt(maxInt(width, height), iuinStickerMaxStaticDimension)
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
			if len(last) <= iuinStickerMaxBytes {
				return last, "image/png", bounds.Dx(), bounds.Dy(), "png", nil
			}
		}

		var jpegImg image.Image = candidate
		if hasAlpha {
			jpegImg = iuinStickerFlattenImage(candidate)
		}
		for _, quality := range jpegQualities {
			buf := &bytes.Buffer{}
			if err := jpeg.Encode(buf, jpegImg, &jpeg.Options{Quality: quality}); err != nil {
				return nil, "", 0, 0, "", fmt.Errorf("encode jpeg: %w", err)
			}
			last = buf.Bytes()
			if len(last) <= iuinStickerMaxBytes {
				return last, "image/jpeg", bounds.Dx(), bounds.Dy(), "jpg", nil
			}
		}
	}

	return nil, "", 0, 0, "", fmt.Errorf("image is still larger than %d bytes after compression, last size %d bytes", iuinStickerMaxBytes, len(last))
}

func processIuinStickerGIF(data []byte, width int, height int) ([]byte, int, int, error) {
	if len(data) <= iuinStickerMaxBytes && maxInt(width, height) <= iuinStickerMaxGIFDimension {
		return data, width, height, nil
	}

	src, err := gif.DecodeAll(bytes.NewReader(data))
	if err != nil {
		return nil, 0, 0, fmt.Errorf("decode gif: %w", err)
	}

	baseMax := minInt(maxInt(width, height), iuinStickerMaxGIFDimension)
	frameSteps := []int{1, 2, 3, 4, 6}
	scaleSteps := []float64{1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3}

	var lastSize int
	for _, frameStep := range frameSteps {
		for _, scale := range scaleSteps {
			targetMax := maxInt(96, int(float64(baseMax)*scale))
			content, outWidth, outHeight, err := encodeIuinStickerGIF(src, targetMax, frameStep)
			if err != nil {
				return nil, 0, 0, err
			}
			lastSize = len(content)
			if lastSize <= iuinStickerMaxBytes {
				return content, outWidth, outHeight, nil
			}
		}
	}

	return nil, 0, 0, fmt.Errorf("gif is still larger than %d bytes after compression, last size %d bytes", iuinStickerMaxBytes, lastSize)
}

func encodeIuinStickerGIF(src *gif.GIF, targetMax int, frameStep int) ([]byte, int, int, error) {
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
		out.Image = append(out.Image, iuinStickerImageToPaletted(resized))
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

func makeIuinStickerImageData(content []byte, mimeType string, width int, height int, ext string) iuinStickerImageData {
	sum := sha256.Sum256(content)
	return iuinStickerImageData{
		Content:  content,
		MimeType: mimeType,
		Width:    width,
		Height:   height,
		SHA256:   fmt.Sprintf("%x", sum[:]),
		Ext:      ext,
	}
}

func iuinStickerFormatToMimeExt(format string) (string, string, bool) {
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

func iuinStickerImageHasAlpha(img image.Image) bool {
	type opaque interface {
		Opaque() bool
	}
	if o, ok := img.(opaque); ok {
		return !o.Opaque()
	}
	return true
}

func iuinStickerFlattenImage(img image.Image) image.Image {
	bounds := img.Bounds()
	flattened := image.NewRGBA(bounds)
	draw.Draw(flattened, bounds, &image.Uniform{C: color.White}, image.Point{}, draw.Src)
	draw.Draw(flattened, bounds, img, bounds.Min, draw.Over)
	return flattened
}

func iuinStickerImageToPaletted(img image.Image) *image.Paletted {
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

func newIuinStickerAppError(where string, statusCode int, err error) *model.AppError {
	return model.NewAppError(where, "api.iuin_stickers.storage_error", nil, "", statusCode).Wrap(err)
}
