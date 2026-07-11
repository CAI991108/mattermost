// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	pathpkg "path"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

const (
	iuinEmojiAssetStorageRoot   = "iuin_emoji_assets"
	iuinEmojiMaxPerUser         = 500
	iuinEmojiInternalNamePrefix = "iuin_"
	iuinEmojiDisplayModeSticker = "sticker"
)

type iuinEmojiAssetRow struct {
	EmojiID   string
	Name      string
	CreatorID string
	FilePath  string
	Filename  string
	MimeType  string
	SizeBytes int64
	Width     int
	Height    int
	SHA256    string
	CreateAt  int64
	UpdateAt  int64
	LibraryAt int64
}

type iuinEmojiPayload struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
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
	LibraryAt     int64  `json:"libraryAt"`
}

type iuinEmojiSendRequest struct {
	ChannelID string `json:"channel_id"`
	RootID    string `json:"root_id"`
}

func (api *API) InitIuinEmojis() {
	iuin := api.BaseRoutes.APIRoot.PathPrefix("/iuin").Subrouter()

	iuin.Handle("/emojis", api.APISessionRequired(listIuinEmojis)).Methods(http.MethodGet)
	iuin.Handle("/emojis", api.APISessionRequired(uploadIuinEmoji, handlerParamFileAPI)).Methods(http.MethodPost)
	iuin.Handle("/emojis/{emoji_id:[A-Za-z0-9]+}/library", api.APISessionRequired(addIuinEmojiToLibrary)).Methods(http.MethodPost)
	iuin.Handle("/emojis/{emoji_id:[A-Za-z0-9]+}/library", api.APISessionRequired(removeIuinEmojiFromLibrary)).Methods(http.MethodDelete)
	iuin.Handle("/emojis/{emoji_id:[A-Za-z0-9]+}/send", api.APISessionRequired(sendIuinEmoji)).Methods(http.MethodPost)
	iuin.Handle("/emojis/{emoji_id:[A-Za-z0-9]+}/image", api.APISessionRequiredTrustRequester(getIuinEmojiImage)).Methods(http.MethodGet)
}

func listIuinEmojis(c *Context, w http.ResponseWriter, r *http.Request) {
	rows, appErr := selectIuinUserEmojis(r.Context(), c.App.Srv().Store().GetInternalReplicaDB(), c.AppContext.Session().UserId)
	if appErr != nil {
		c.Err = appErr
		return
	}

	payload := make([]iuinEmojiPayload, 0, len(rows))
	for _, row := range rows {
		payload = append(payload, makeIuinEmojiPayload(row))
	}

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func uploadIuinEmoji(c *Context, w http.ResponseWriter, r *http.Request) {
	if !*c.App.Config().ServiceSettings.EnableCustomEmoji {
		c.Err = model.NewAppError("uploadIuinEmoji", "api.emoji.disabled.app_error", nil, "", http.StatusNotImplemented)
		return
	}

	defer func() {
		if _, err := io.Copy(io.Discard, r.Body); err != nil {
			c.Logger.Warn("Error while discarding request body", mlog.Err(err))
		}
	}()

	r.Body = http.MaxBytesReader(w, r.Body, iuinImageUploadReadLimit)
	if err := r.ParseMultipartForm(iuinImageMultipartMemory); err != nil {
		c.Err = model.NewAppError("uploadIuinEmoji", "api.iuin_emojis.parse.app_error", nil, "", http.StatusBadRequest).Wrap(err)
		return
	}
	defer r.MultipartForm.RemoveAll()

	fileHeader := firstIuinImageUploadFile(r.MultipartForm)
	if fileHeader == nil {
		c.SetInvalidParam("image")
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.Err = model.NewAppError("uploadIuinEmoji", "api.iuin_emojis.open.app_error", nil, "", http.StatusBadRequest).Wrap(err)
		return
	}
	defer file.Close()

	raw, err := io.ReadAll(io.LimitReader(file, iuinEmojiUploadMaxBytes+1))
	if err != nil {
		c.Err = model.NewAppError("uploadIuinEmoji", "api.iuin_emojis.read.app_error", nil, "", http.StatusBadRequest).Wrap(err)
		return
	}
	if len(raw) > iuinEmojiUploadMaxBytes {
		c.Err = model.NewAppError("uploadIuinEmoji", "api.iuin_emojis.too_large.app_error", nil, "", http.StatusRequestEntityTooLarge)
		return
	}

	processed, err := processIuinImageAsset(raw, iuinEmojiAssetMaxBytes)
	if err != nil {
		c.Err = model.NewAppError("uploadIuinEmoji", "api.iuin_emojis.process.app_error", nil, err.Error(), http.StatusBadRequest).Wrap(err)
		return
	}

	row, appErr := getOrCreateIuinEmoji(r.Context(), c, c.App.Srv().Store().GetInternalMasterDB(), c.AppContext.Session().UserId, sanitizeIuinImageFilename(fileHeader.Filename), processed)
	if appErr != nil {
		c.Err = appErr
		return
	}

	if err := json.NewEncoder(w).Encode(makeIuinEmojiPayload(*row)); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func addIuinEmojiToLibrary(c *Context, w http.ResponseWriter, r *http.Request) {
	emojiID := iuinEmojiIDFromRequest(r)
	if !model.IsValidId(emojiID) {
		c.SetInvalidURLParam("emoji_id")
		return
	}

	db := c.App.Srv().Store().GetInternalMasterDB()
	if _, appErr := selectIuinEmojiByID(r.Context(), db, emojiID); appErr != nil {
		c.Err = appErr
		return
	}
	if appErr := addIuinUserEmoji(r.Context(), db, c.AppContext.Session().UserId, emojiID); appErr != nil {
		c.Err = appErr
		return
	}

	row, appErr := selectIuinEmojiForUser(r.Context(), db, c.AppContext.Session().UserId, emojiID)
	if appErr != nil {
		c.Err = appErr
		return
	}
	if err := json.NewEncoder(w).Encode(makeIuinEmojiPayload(*row)); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func removeIuinEmojiFromLibrary(c *Context, w http.ResponseWriter, r *http.Request) {
	emojiID := iuinEmojiIDFromRequest(r)
	if !model.IsValidId(emojiID) {
		c.SetInvalidURLParam("emoji_id")
		return
	}

	now := model.GetMillis()
	if _, err := c.App.Srv().Store().GetInternalMasterDB().ExecContext(r.Context(), `
		UPDATE IuinUserEmojis
		   SET DeleteAt = $3, UpdateAt = $3
		 WHERE UserId = $1 AND EmojiId = $2 AND DeleteAt = 0`, c.AppContext.Session().UserId, emojiID, now); err != nil {
		c.Err = newIuinEmojiAppError("removeIuinEmojiFromLibrary", http.StatusInternalServerError, err)
		return
	}

	ReturnStatusOK(w)
}

func sendIuinEmoji(c *Context, w http.ResponseWriter, r *http.Request) {
	emojiID := iuinEmojiIDFromRequest(r)
	if !model.IsValidId(emojiID) {
		c.SetInvalidURLParam("emoji_id")
		return
	}

	var req iuinEmojiSendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		c.SetInvalidParamWithErr("request", err)
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
	asset, appErr := selectIuinEmojiForUser(r.Context(), db, c.AppContext.Session().UserId, emojiID)
	if appErr != nil {
		c.Err = model.NewAppError("sendIuinEmoji", "api.iuin_emojis.not_in_library", nil, "", http.StatusForbidden).Wrap(appErr)
		return
	}

	post := &model.Post{
		UserId:    c.AppContext.Session().UserId,
		ChannelId: req.ChannelID,
		RootId:    req.RootID,
		Message:   "",
		Props: model.StringInterface{
			"iuin_emoji_id":           asset.EmojiID,
			"iuin_emoji_name":         asset.Name,
			"iuin_emoji_display_mode": iuinEmojiDisplayModeSticker,
			"iuin_emoji_url":          iuinEmojiImageURL(asset.EmojiID),
			"iuin_emoji_mime":         asset.MimeType,
			"iuin_emoji_width":        asset.Width,
			"iuin_emoji_height":       asset.Height,
		},
	}

	createPostChecks("sendIuinEmoji", c, post)
	if c.Err != nil {
		return
	}

	rp, isMemberForPreviews, createErr := c.App.CreatePostAsUser(c.AppContext, c.App.PostWithProxyRemovedFromImageURLs(post), c.AppContext.Session().Id, true)
	if createErr != nil {
		c.Err = createErr
		return
	}
	if !isMemberForPreviews {
		if previewPost := rp.GetPreviewPost(); previewPost != nil {
			c.Logger.Debug("Created emoji post preview for non-channel member access", mlog.String("preview_post_id", previewPost.Post.Id))
		}
	}

	if recentErr := recordIuinRecentEmoji(r.Context(), c.App.Srv().Store().GetInternalMasterDB(), c.AppContext.Session().UserId, asset.Name); recentErr != nil {
		c.Logger.Warn("Failed to record recently used IUIN emoji", mlog.Err(recentErr))
	}

	c.App.SetStatusOnline(c.AppContext.Session().UserId, false)
	c.App.Srv().Platform().UpdateLastActivityAtIfNeeded(*c.AppContext.Session())
	c.ExtendSessionExpiryIfNeeded(w, r)

	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(rp); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func getIuinEmojiImage(c *Context, w http.ResponseWriter, r *http.Request) {
	emojiID := iuinEmojiIDFromRequest(r)
	if !model.IsValidId(emojiID) {
		c.SetInvalidURLParam("emoji_id")
		return
	}

	row, appErr := selectIuinEmojiByID(r.Context(), c.App.Srv().Store().GetInternalReplicaDB(), emojiID)
	if appErr != nil {
		c.Err = appErr
		return
	}
	data, readErr := c.App.ReadFile(row.FilePath)
	if readErr != nil {
		c.Err = newIuinEmojiAppError("getIuinEmojiImage.read", http.StatusNotFound, readErr)
		return
	}

	w.Header().Set("Content-Type", row.MimeType)
	w.Header().Set("Cache-Control", "private, max-age=2592000")
	if _, err := w.Write(data); err != nil {
		c.Logger.Warn("Error while writing IUIN emoji image", mlog.Err(err))
	}
}

func getOrCreateIuinEmoji(ctx context.Context, c *Context, db *sql.DB, userID string, filename string, data iuinImageAssetData) (*iuinEmojiAssetRow, *model.AppError) {
	if existing, appErr := selectIuinEmojiBySHA(ctx, db, data.SHA256); appErr == nil {
		if addErr := addIuinUserEmoji(ctx, db, userID, existing.EmojiID); addErr != nil {
			return nil, addErr
		}
		return selectIuinEmojiForUser(ctx, db, userID, existing.EmojiID)
	} else if !errors.Is(appErr.Unwrap(), sql.ErrNoRows) {
		return nil, appErr
	}

	now := model.GetMillis()
	emojiID := model.NewId()
	row := &iuinEmojiAssetRow{
		EmojiID:   emojiID,
		Name:      iuinEmojiInternalNamePrefix + emojiID,
		CreatorID: userID,
		Filename:  filename,
		MimeType:  data.MimeType,
		SizeBytes: int64(len(data.Content)),
		Width:     data.Width,
		Height:    data.Height,
		SHA256:    data.SHA256,
		CreateAt:  now,
		UpdateAt:  now,
		LibraryAt: now,
	}
	row.FilePath = pathpkg.Join(iuinEmojiAssetStorageRoot, emojiID, "original."+data.Ext)

	if _, appErr := c.App.WriteFile(bytes.NewReader(data.Content), row.FilePath); appErr != nil {
		return nil, newIuinEmojiAppError("getOrCreateIuinEmoji.write", http.StatusInternalServerError, appErr)
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		_ = c.App.RemoveFile(row.FilePath)
		return nil, newIuinEmojiAppError("getOrCreateIuinEmoji.begin", http.StatusInternalServerError, err)
	}
	defer tx.Rollback()

	if _, err = tx.ExecContext(ctx, `
		INSERT INTO Emoji (Id, CreateAt, UpdateAt, DeleteAt, CreatorId, Name)
		VALUES ($1, $2, $2, 0, $3, $4)`, row.EmojiID, now, userID, row.Name); err != nil {
		_ = c.App.RemoveFile(row.FilePath)
		return nil, newIuinEmojiAppError("getOrCreateIuinEmoji.insert_emoji", http.StatusInternalServerError, err)
	}
	if _, err = tx.ExecContext(ctx, `
		INSERT INTO IuinEmojiAssets
			(EmojiId, FilePath, Filename, MimeType, SizeBytes, Width, Height, Sha256, CreateAt, UpdateAt, DeleteAt)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 0)`,
		row.EmojiID, row.FilePath, row.Filename, row.MimeType, row.SizeBytes, row.Width, row.Height, row.SHA256, now); err != nil {
		_ = c.App.RemoveFile(row.FilePath)
		return nil, newIuinEmojiAppError("getOrCreateIuinEmoji.insert_asset", http.StatusInternalServerError, err)
	}
	if _, err = tx.ExecContext(ctx, `
		INSERT INTO IuinUserEmojis (UserId, EmojiId, SortOrder, CreateAt, UpdateAt, DeleteAt)
		VALUES ($1, $2, $3, $3, $3, 0)`, userID, row.EmojiID, now); err != nil {
		_ = c.App.RemoveFile(row.FilePath)
		return nil, newIuinEmojiAppError("getOrCreateIuinEmoji.insert_library", http.StatusInternalServerError, err)
	}
	if err = tx.Commit(); err != nil {
		_ = c.App.RemoveFile(row.FilePath)
		return nil, newIuinEmojiAppError("getOrCreateIuinEmoji.commit", http.StatusInternalServerError, err)
	}

	return row, nil
}

func addIuinUserEmoji(ctx context.Context, db *sql.DB, userID string, emojiID string) *model.AppError {
	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM IuinUserEmojis WHERE UserId = $1 AND DeleteAt = 0`, userID).Scan(&count); err != nil {
		return newIuinEmojiAppError("addIuinUserEmoji.count", http.StatusInternalServerError, err)
	}
	if count >= iuinEmojiMaxPerUser {
		var active bool
		if err := db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM IuinUserEmojis WHERE UserId = $1 AND EmojiId = $2 AND DeleteAt = 0)`, userID, emojiID).Scan(&active); err != nil {
			return newIuinEmojiAppError("addIuinUserEmoji.exists", http.StatusInternalServerError, err)
		}
		if !active {
			return model.NewAppError("addIuinUserEmoji", "api.iuin_emojis.library_limit", map[string]any{"Limit": iuinEmojiMaxPerUser}, "", http.StatusBadRequest)
		}
	}

	now := model.GetMillis()
	if _, err := db.ExecContext(ctx, `
		INSERT INTO IuinUserEmojis (UserId, EmojiId, SortOrder, CreateAt, UpdateAt, DeleteAt)
		VALUES ($1, $2, $3, $3, $3, 0)
		ON CONFLICT (UserId, EmojiId) DO UPDATE
		SET SortOrder = EXCLUDED.SortOrder, UpdateAt = EXCLUDED.UpdateAt, DeleteAt = 0`, userID, emojiID, now); err != nil {
		return newIuinEmojiAppError("addIuinUserEmoji.upsert", http.StatusInternalServerError, err)
	}
	return nil
}

func selectIuinUserEmojis(ctx context.Context, db *sql.DB, userID string) ([]iuinEmojiAssetRow, *model.AppError) {
	rows, err := db.QueryContext(ctx, `
		SELECT e.Id, e.Name, e.CreatorId, a.FilePath, a.Filename, a.MimeType, a.SizeBytes,
		       a.Width, a.Height, a.Sha256, a.CreateAt, a.UpdateAt, ue.SortOrder
		  FROM IuinUserEmojis ue
		  JOIN Emoji e ON e.Id = ue.EmojiId AND e.DeleteAt = 0
		  JOIN IuinEmojiAssets a ON a.EmojiId = e.Id AND a.DeleteAt = 0
		 WHERE ue.UserId = $1 AND ue.DeleteAt = 0
		 ORDER BY ue.SortOrder DESC`, userID)
	if err != nil {
		return nil, newIuinEmojiAppError("selectIuinUserEmojis", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	result := make([]iuinEmojiAssetRow, 0)
	for rows.Next() {
		var row iuinEmojiAssetRow
		if err := rows.Scan(&row.EmojiID, &row.Name, &row.CreatorID, &row.FilePath, &row.Filename, &row.MimeType, &row.SizeBytes, &row.Width, &row.Height, &row.SHA256, &row.CreateAt, &row.UpdateAt, &row.LibraryAt); err != nil {
			return nil, newIuinEmojiAppError("selectIuinUserEmojis.scan", http.StatusInternalServerError, err)
		}
		result = append(result, row)
	}
	if err := rows.Err(); err != nil {
		return nil, newIuinEmojiAppError("selectIuinUserEmojis.rows", http.StatusInternalServerError, err)
	}
	return result, nil
}

func selectIuinEmojiForUser(ctx context.Context, db *sql.DB, userID string, emojiID string) (*iuinEmojiAssetRow, *model.AppError) {
	row := &iuinEmojiAssetRow{}
	err := db.QueryRowContext(ctx, `
		SELECT e.Id, e.Name, e.CreatorId, a.FilePath, a.Filename, a.MimeType, a.SizeBytes,
		       a.Width, a.Height, a.Sha256, a.CreateAt, a.UpdateAt, ue.SortOrder
		  FROM IuinUserEmojis ue
		  JOIN Emoji e ON e.Id = ue.EmojiId AND e.DeleteAt = 0
		  JOIN IuinEmojiAssets a ON a.EmojiId = e.Id AND a.DeleteAt = 0
		 WHERE ue.UserId = $1 AND ue.EmojiId = $2 AND ue.DeleteAt = 0`, userID, emojiID).
		Scan(&row.EmojiID, &row.Name, &row.CreatorID, &row.FilePath, &row.Filename, &row.MimeType, &row.SizeBytes, &row.Width, &row.Height, &row.SHA256, &row.CreateAt, &row.UpdateAt, &row.LibraryAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, newIuinEmojiAppError("selectIuinEmojiForUser", http.StatusNotFound, err)
	}
	if err != nil {
		return nil, newIuinEmojiAppError("selectIuinEmojiForUser", http.StatusInternalServerError, err)
	}
	return row, nil
}

func selectIuinEmojiByID(ctx context.Context, db *sql.DB, emojiID string) (*iuinEmojiAssetRow, *model.AppError) {
	row := &iuinEmojiAssetRow{}
	err := db.QueryRowContext(ctx, `
		SELECT e.Id, e.Name, e.CreatorId, a.FilePath, a.Filename, a.MimeType, a.SizeBytes,
		       a.Width, a.Height, a.Sha256, a.CreateAt, a.UpdateAt, 0
		  FROM Emoji e
		  JOIN IuinEmojiAssets a ON a.EmojiId = e.Id AND a.DeleteAt = 0
		 WHERE e.Id = $1 AND e.DeleteAt = 0`, emojiID).
		Scan(&row.EmojiID, &row.Name, &row.CreatorID, &row.FilePath, &row.Filename, &row.MimeType, &row.SizeBytes, &row.Width, &row.Height, &row.SHA256, &row.CreateAt, &row.UpdateAt, &row.LibraryAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, newIuinEmojiAppError("selectIuinEmojiByID", http.StatusNotFound, err)
	}
	if err != nil {
		return nil, newIuinEmojiAppError("selectIuinEmojiByID", http.StatusInternalServerError, err)
	}
	return row, nil
}

func selectIuinEmojiBySHA(ctx context.Context, db *sql.DB, sha string) (*iuinEmojiAssetRow, *model.AppError) {
	row := &iuinEmojiAssetRow{}
	err := db.QueryRowContext(ctx, `
		SELECT e.Id, e.Name, e.CreatorId, a.FilePath, a.Filename, a.MimeType, a.SizeBytes,
		       a.Width, a.Height, a.Sha256, a.CreateAt, a.UpdateAt, 0
		  FROM IuinEmojiAssets a
		  JOIN Emoji e ON e.Id = a.EmojiId AND e.DeleteAt = 0
		 WHERE a.Sha256 = $1 AND a.DeleteAt = 0`, sha).
		Scan(&row.EmojiID, &row.Name, &row.CreatorID, &row.FilePath, &row.Filename, &row.MimeType, &row.SizeBytes, &row.Width, &row.Height, &row.SHA256, &row.CreateAt, &row.UpdateAt, &row.LibraryAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, newIuinEmojiAppError("selectIuinEmojiBySHA", http.StatusNotFound, err)
	}
	if err != nil {
		return nil, newIuinEmojiAppError("selectIuinEmojiBySHA", http.StatusInternalServerError, err)
	}
	return row, nil
}

func makeIuinEmojiPayload(row iuinEmojiAssetRow) iuinEmojiPayload {
	return iuinEmojiPayload{
		ID:            row.EmojiID,
		Name:          row.Name,
		CreatorUserID: row.CreatorID,
		Filename:      row.Filename,
		MimeType:      row.MimeType,
		SizeBytes:     row.SizeBytes,
		Width:         row.Width,
		Height:        row.Height,
		SHA256:        row.SHA256,
		ImageURL:      iuinEmojiImageURL(row.EmojiID),
		CreatedAt:     row.CreateAt,
		UpdatedAt:     row.UpdateAt,
		LibraryAt:     row.LibraryAt,
	}
}

func iuinEmojiIDFromRequest(r *http.Request) string {
	vars := mux.Vars(r)
	if id := vars["emoji_id"]; id != "" {
		return id
	}
	return vars["sticker_id"]
}

func iuinEmojiImageURL(emojiID string) string {
	return "/api/v4/emoji/" + emojiID + "/image"
}

func newIuinEmojiAppError(where string, statusCode int, err error) *model.AppError {
	return model.NewAppError(where, "api.iuin_emojis.storage_error", nil, "", statusCode).Wrap(err)
}
