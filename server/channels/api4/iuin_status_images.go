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
	iuinStatusImageStorageRoot = "iuin_status_images"
	iuinStatusImageTokenPrefix = "iuin-status-image:"
	iuinStatusImageMaxBytes    = 512 * 1024
	iuinStatusImageReadLimit   = 2 * 1024 * 1024
)

type iuinStatusImageRow struct {
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
}

type iuinStatusImagePayload struct {
	ID        string `json:"id"`
	Token     string `json:"token"`
	ImageURL  string `json:"imageUrl"`
	MimeType  string `json:"mimeType"`
	SizeBytes int64  `json:"sizeBytes"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

func (api *API) InitIuinStatusImages() {
	iuin := api.BaseRoutes.APIRoot.PathPrefix("/iuin").Subrouter()
	iuin.Handle("/status_emojis", api.APISessionRequired(listIuinStatusImages)).Methods(http.MethodGet)
	iuin.Handle("/status_emojis", api.APISessionRequired(uploadIuinStatusImage, handlerParamFileAPI)).Methods(http.MethodPost)
	iuin.Handle("/status_emojis/{status_image_id:[A-Za-z0-9]+}/image", api.APISessionRequiredTrustRequester(getIuinStatusImage)).Methods(http.MethodGet)

	// Compatibility aliases for the first decoupling iteration.
	iuin.Handle("/status_images", api.APISessionRequired(listIuinStatusImages)).Methods(http.MethodGet)
	iuin.Handle("/status_images", api.APISessionRequired(uploadIuinStatusImage, handlerParamFileAPI)).Methods(http.MethodPost)
	iuin.Handle("/status_images/{status_image_id:[A-Za-z0-9]+}/image", api.APISessionRequiredTrustRequester(getIuinStatusImage)).Methods(http.MethodGet)
}

func listIuinStatusImages(c *Context, w http.ResponseWriter, r *http.Request) {
	rows, appErr := selectIuinStatusImagesForUser(r.Context(), c.App.Srv().Store().GetInternalReplicaDB(), c.AppContext.Session().UserId)
	if appErr != nil {
		c.Err = appErr
		return
	}

	payload := make([]iuinStatusImagePayload, 0, len(rows))
	for _, row := range rows {
		payload = append(payload, makeIuinStatusImagePayload(row))
	}
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func uploadIuinStatusImage(c *Context, w http.ResponseWriter, r *http.Request) {
	if !*c.App.Config().TeamSettings.EnableCustomUserStatuses {
		c.Err = model.NewAppError("uploadIuinStatusImage", "api.custom_status.disabled", nil, "", http.StatusNotImplemented)
		return
	}

	defer func() {
		if _, err := io.Copy(io.Discard, r.Body); err != nil {
			c.Logger.Warn("Error while discarding request body", mlog.Err(err))
		}
	}()

	r.Body = http.MaxBytesReader(w, r.Body, iuinStatusImageReadLimit)
	if err := r.ParseMultipartForm(iuinStatusImageReadLimit); err != nil {
		c.Err = model.NewAppError("uploadIuinStatusImage", "api.iuin_status_images.parse.app_error", nil, "", http.StatusBadRequest).Wrap(err)
		return
	}

	fileHeader := firstIuinImageUploadFile(r.MultipartForm)
	if fileHeader == nil {
		c.SetInvalidParam("image")
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.Err = model.NewAppError("uploadIuinStatusImage", "api.iuin_status_images.open.app_error", nil, "", http.StatusBadRequest).Wrap(err)
		return
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, iuinStatusImageMaxBytes+1))
	if err != nil {
		c.Err = model.NewAppError("uploadIuinStatusImage", "api.iuin_status_images.read.app_error", nil, "", http.StatusBadRequest).Wrap(err)
		return
	}
	if len(data) > iuinStatusImageMaxBytes {
		c.Err = model.NewAppError("uploadIuinStatusImage", "api.iuin_status_images.too_large.app_error", nil, "", http.StatusRequestEntityTooLarge)
		return
	}

	processed, err := processIuinImageAsset(data, iuinStatusImageMaxBytes)
	if err != nil {
		c.Err = model.NewAppError("uploadIuinStatusImage", "api.iuin_status_images.process.app_error", nil, err.Error(), http.StatusBadRequest).Wrap(err)
		return
	}

	row, appErr := getOrCreateIuinStatusImage(r.Context(), c, c.App.Srv().Store().GetInternalMasterDB(), c.AppContext.Session().UserId, sanitizeIuinImageFilename(fileHeader.Filename), processed)
	if appErr != nil {
		c.Err = appErr
		return
	}

	if err := json.NewEncoder(w).Encode(makeIuinStatusImagePayload(*row)); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func getIuinStatusImage(c *Context, w http.ResponseWriter, r *http.Request) {
	statusImageID := mux.Vars(r)["status_image_id"]
	if !model.IsValidId(statusImageID) {
		c.SetInvalidURLParam("status_image_id")
		return
	}

	row, appErr := selectIuinStatusImageByID(r.Context(), c.App.Srv().Store().GetInternalReplicaDB(), statusImageID)
	if appErr != nil {
		c.Err = appErr
		return
	}

	data, appErr := c.App.ReadFile(row.FilePath)
	if appErr != nil {
		c.Err = newIuinStatusImageAppError("getIuinStatusImage.read", http.StatusNotFound, appErr)
		return
	}

	w.Header().Set("Content-Type", row.MimeType)
	w.Header().Set("Cache-Control", "private, max-age=86400")
	if _, err := w.Write(data); err != nil {
		c.Logger.Warn("Error while writing status image", mlog.Err(err))
	}
}

func getOrCreateIuinStatusImage(ctx context.Context, c *Context, db *sql.DB, creatorUserID string, filename string, data iuinImageAssetData) (*iuinStatusImageRow, *model.AppError) {
	row, appErr := selectIuinStatusImageByCreatorAndSHA(ctx, db, creatorUserID, data.SHA256)
	if appErr == nil {
		return row, nil
	}
	if !errors.Is(appErr.Unwrap(), sql.ErrNoRows) {
		return nil, appErr
	}

	now := model.GetMillis()
	row = &iuinStatusImageRow{
		ID:            model.NewId(),
		CreatorUserID: creatorUserID,
		Filename:      filename,
		MimeType:      data.MimeType,
		SizeBytes:     int64(len(data.Content)),
		Width:         data.Width,
		Height:        data.Height,
		SHA256:        data.SHA256,
		CreateAt:      now,
		UpdateAt:      now,
	}
	row.FilePath = pathpkg.Join(iuinStatusImageStorageRoot, row.ID, "original."+data.Ext)

	if _, appErr := c.App.WriteFile(bytes.NewReader(data.Content), row.FilePath); appErr != nil {
		return nil, newIuinStatusImageAppError("getOrCreateIuinStatusImage.write", http.StatusInternalServerError, appErr)
	}

	if _, err := db.ExecContext(ctx, `
		INSERT INTO IuinStatusImages
			(Id, CreatorUserId, FilePath, Filename, MimeType, SizeBytes, Width, Height, Sha256, CreateAt, UpdateAt, DeleteAt)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0)`,
		row.ID, row.CreatorUserID, row.FilePath, row.Filename, row.MimeType, row.SizeBytes, row.Width, row.Height, row.SHA256, row.CreateAt, row.UpdateAt); err != nil {
		if removeErr := c.App.RemoveFile(row.FilePath); removeErr != nil {
			c.Logger.Warn("Failed to clean up status image after DB insert failure", mlog.String("path", row.FilePath), mlog.Err(removeErr))
		}
		return nil, newIuinStatusImageAppError("getOrCreateIuinStatusImage.insert", http.StatusInternalServerError, err)
	}

	return row, nil
}

func selectIuinStatusImageByCreatorAndSHA(ctx context.Context, db *sql.DB, creatorUserID string, sha string) (*iuinStatusImageRow, *model.AppError) {
	row := &iuinStatusImageRow{}
	err := db.QueryRowContext(ctx, `
		SELECT Id, CreatorUserId, FilePath, Filename, MimeType, SizeBytes, Width, Height, Sha256, CreateAt, UpdateAt
		  FROM IuinStatusImages
		 WHERE CreatorUserId = $1 AND Sha256 = $2 AND DeleteAt = 0`, creatorUserID, sha).
		Scan(&row.ID, &row.CreatorUserID, &row.FilePath, &row.Filename, &row.MimeType, &row.SizeBytes, &row.Width, &row.Height, &row.SHA256, &row.CreateAt, &row.UpdateAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, newIuinStatusImageAppError("selectIuinStatusImageByCreatorAndSHA", http.StatusNotFound, err)
	}
	if err != nil {
		return nil, newIuinStatusImageAppError("selectIuinStatusImageByCreatorAndSHA", http.StatusInternalServerError, err)
	}
	return row, nil
}

func selectIuinStatusImageByID(ctx context.Context, db *sql.DB, statusImageID string) (*iuinStatusImageRow, *model.AppError) {
	row := &iuinStatusImageRow{}
	err := db.QueryRowContext(ctx, `
		SELECT Id, CreatorUserId, FilePath, Filename, MimeType, SizeBytes, Width, Height, Sha256, CreateAt, UpdateAt
		  FROM IuinStatusImages
		 WHERE Id = $1 AND DeleteAt = 0`, statusImageID).
		Scan(&row.ID, &row.CreatorUserID, &row.FilePath, &row.Filename, &row.MimeType, &row.SizeBytes, &row.Width, &row.Height, &row.SHA256, &row.CreateAt, &row.UpdateAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, newIuinStatusImageAppError("selectIuinStatusImageByID", http.StatusNotFound, err)
	}
	if err != nil {
		return nil, newIuinStatusImageAppError("selectIuinStatusImageByID", http.StatusInternalServerError, err)
	}
	return row, nil
}

func selectIuinStatusImagesForUser(ctx context.Context, db *sql.DB, userID string) ([]iuinStatusImageRow, *model.AppError) {
	rows, err := db.QueryContext(ctx, `
		SELECT Id, CreatorUserId, FilePath, Filename, MimeType, SizeBytes, Width, Height, Sha256, CreateAt, UpdateAt
		  FROM IuinStatusImages
		 WHERE CreatorUserId = $1 AND DeleteAt = 0
		 ORDER BY UpdateAt DESC`, userID)
	if err != nil {
		return nil, newIuinStatusImageAppError("selectIuinStatusImagesForUser", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	result := make([]iuinStatusImageRow, 0)
	for rows.Next() {
		var row iuinStatusImageRow
		if err := rows.Scan(&row.ID, &row.CreatorUserID, &row.FilePath, &row.Filename, &row.MimeType, &row.SizeBytes, &row.Width, &row.Height, &row.SHA256, &row.CreateAt, &row.UpdateAt); err != nil {
			return nil, newIuinStatusImageAppError("selectIuinStatusImagesForUser.scan", http.StatusInternalServerError, err)
		}
		result = append(result, row)
	}
	if err := rows.Err(); err != nil {
		return nil, newIuinStatusImageAppError("selectIuinStatusImagesForUser.rows", http.StatusInternalServerError, err)
	}
	return result, nil
}

func makeIuinStatusImagePayload(row iuinStatusImageRow) iuinStatusImagePayload {
	return iuinStatusImagePayload{
		ID:        row.ID,
		Token:     iuinStatusImageTokenPrefix + row.ID,
		ImageURL:  iuinStatusImageURL(row.ID),
		MimeType:  row.MimeType,
		SizeBytes: row.SizeBytes,
		Width:     row.Width,
		Height:    row.Height,
		CreatedAt: row.CreateAt,
		UpdatedAt: row.UpdateAt,
	}
}

func iuinStatusImageURL(statusImageID string) string {
	return "/api/v4/iuin/status_emojis/" + statusImageID + "/image"
}

func newIuinStatusImageAppError(where string, statusCode int, err error) *model.AppError {
	return model.NewAppError(where, "api.iuin_status_images.storage_error", nil, "", statusCode).Wrap(err)
}
