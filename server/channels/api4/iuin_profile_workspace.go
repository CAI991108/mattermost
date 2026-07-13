// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	pathpkg "path"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

const (
	iuinProfileWorkspaceMainFile = "README.md"
	iuinProfileStorageRoot       = "iuin_profile"
	iuinProfileEntryBlobName     = "original"

	iuinProfileFileMaxBytes             = int64(5 * 1024 * 1024)
	iuinProfileWorkspaceMaxBytes        = int64(50 * 1024 * 1024)
	iuinProfileUploadReadLimit          = iuinProfileFileMaxBytes + (1024 * 1024)
	iuinProfileMultipartMemory          = int64(512 * 1024)
	iuinProfileWorkspaceJSONReadLimit   = int64(72 * 1024 * 1024)
	iuinProfileExternalReferenceMaxSize = int64(4096)
	iuinProfileWorkspacePathMaxBytes    = 1024
)

type iuinProfileWorkspacePayload struct {
	ID                 string                   `json:"id,omitempty"`
	UserID             string                   `json:"userId,omitempty"`
	RootName           string                   `json:"rootName"`
	ActivePath         string                   `json:"activePath"`
	GitHubRenderedHTML string                   `json:"githubRenderedHtml,omitempty"`
	Files              []iuinProfileFilePayload `json:"files"`
	StoragePrefix      string                   `json:"storagePrefix,omitempty"`
}

type iuinProfileFilePayload struct {
	ID         string `json:"id,omitempty"`
	Path       string `json:"path"`
	Content    string `json:"content,omitempty"`
	Type       string `json:"type"`
	MimeType   string `json:"mimeType,omitempty"`
	SizeBytes  int64  `json:"sizeBytes,omitempty"`
	SHA256     string `json:"sha256,omitempty"`
	StorageKey string `json:"storageKey,omitempty"`
	SortOrder  int64  `json:"sortOrder"`
	UpdatedAt  int64  `json:"updatedAt"`
}

type iuinProfileWorkspaceRow struct {
	ID                 string
	UserID             string
	RootName           string
	ActivePath         string
	GitHubRenderedHTML string
	CreateAt           int64
	UpdateAt           int64
}

type iuinProfileEntryRow struct {
	ID          string
	WorkspaceID string
	ParentID    string
	Path        string
	Name        string
	Type        string
	MimeType    string
	SizeBytes   int64
	SHA256      string
	StorageKey  string
	SortOrder   int64
	CreateAt    int64
	UpdateAt    int64
}

type pendingIuinProfileEntry struct {
	iuinProfileEntryRow
	Content      []byte
	ReuseStorage bool
}

func getIuinProfileWorkspace(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireUserId()
	if c.Err != nil {
		return
	}

	user, appErr := c.App.GetUser(c.Params.UserId)
	if appErr != nil {
		c.Err = appErr
		return
	}

	workspace, appErr := readIuinProfileWorkspace(c, r.Context(), user.Id)
	if appErr != nil {
		c.Err = appErr
		return
	}
	if workspace == nil {
		workspace, appErr = saveIuinProfileWorkspace(c, r.Context(), user.Id, defaultIuinProfileWorkspacePayload(user))
		if appErr != nil {
			c.Err = appErr
			return
		}
	}

	if err := json.NewEncoder(w).Encode(workspace); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func putIuinProfileWorkspace(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireUserId()
	if c.Err != nil {
		return
	}

	if !c.App.SessionHasPermissionToUser(*c.AppContext.Session(), c.Params.UserId) {
		c.SetPermissionError(model.PermissionEditOtherUsers)
		return
	}

	user, appErr := c.App.GetUser(c.Params.UserId)
	if appErr != nil {
		c.Err = appErr
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, iuinProfileWorkspaceJSONReadLimit)
	var payload iuinProfileWorkspacePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			c.Err = model.NewAppError("putIuinProfileWorkspace", "api.iuin_profile_workspace.workspace_too_large", nil, "", http.StatusRequestEntityTooLarge)
			return
		}
		c.SetInvalidParamWithErr("workspace", err)
		return
	}

	workspace, appErr := saveIuinProfileWorkspace(c, r.Context(), user.Id, &payload)
	if appErr != nil {
		c.Err = appErr
		return
	}

	if err := json.NewEncoder(w).Encode(workspace); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func uploadIuinProfileWorkspaceFile(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireUserId()
	if c.Err != nil {
		return
	}

	if !c.App.SessionHasPermissionToUser(*c.AppContext.Session(), c.Params.UserId) {
		c.SetPermissionError(model.PermissionEditOtherUsers)
		return
	}

	user, appErr := c.App.GetUser(c.Params.UserId)
	if appErr != nil {
		c.Err = appErr
		return
	}

	defer func() {
		if _, err := io.Copy(io.Discard, r.Body); err != nil {
			c.Logger.Warn("Error while discarding IUIN profile upload body", mlog.Err(err))
		}
	}()

	r.Body = http.MaxBytesReader(w, r.Body, iuinProfileUploadReadLimit)
	if err := r.ParseMultipartForm(iuinProfileMultipartMemory); err != nil {
		var maxBytesErr *http.MaxBytesError
		statusCode := http.StatusBadRequest
		if errors.As(err, &maxBytesErr) {
			statusCode = http.StatusRequestEntityTooLarge
		}
		c.Err = model.NewAppError("uploadIuinProfileWorkspaceFile", "api.iuin_profile_workspace.invalid_upload", nil, "", statusCode).Wrap(err)
		return
	}
	defer r.MultipartForm.RemoveAll()

	fileHeaders := r.MultipartForm.File["file"]
	if len(fileHeaders) == 0 {
		c.SetInvalidParam("file")
		return
	}
	fileHeader := fileHeaders[0]
	file, err := fileHeader.Open()
	if err != nil {
		c.Err = model.NewAppError("uploadIuinProfileWorkspaceFile", "api.iuin_profile_workspace.invalid_upload", nil, "", http.StatusBadRequest).Wrap(err)
		return
	}
	defer file.Close()

	content, err := io.ReadAll(io.LimitReader(file, iuinProfileFileMaxBytes+1))
	if err != nil {
		c.Err = model.NewAppError("uploadIuinProfileWorkspaceFile", "api.iuin_profile_workspace.invalid_upload", nil, "", http.StatusBadRequest).Wrap(err)
		return
	}
	if int64(len(content)) > iuinProfileFileMaxBytes {
		c.Err = newIuinProfileFileTooLargeAppError("uploadIuinProfileWorkspaceFile")
		return
	}

	entryPath := sanitizeIuinProfileWorkspacePath(firstIuinProfileMultipartValue(r, "path"))
	if entryPath == "" || len(entryPath) > iuinProfileWorkspacePathMaxBytes || !utf8.ValidString(entryPath) {
		c.SetInvalidParam("path")
		return
	}

	entryType, appErr := normalizeIuinProfileEntryType(firstIuinProfileMultipartValue(r, "type"), entryPath, "")
	if appErr != nil || entryType == "folder" {
		c.SetInvalidParam("type")
		return
	}
	if entryType != "asset" && !utf8.Valid(content) {
		c.Err = model.NewAppError("uploadIuinProfileWorkspaceFile", "api.iuin_profile_workspace.invalid_text", nil, "", http.StatusBadRequest)
		return
	}

	mimeType := normalizeIuinProfileUploadMimeType(fileHeader.Header.Get("Content-Type"), content)
	entry, appErr := persistIuinProfileWorkspaceUpload(c, r.Context(), user.Id, entryPath, entryType, mimeType, content)
	if appErr != nil {
		c.Err = appErr
		return
	}

	payload := iuinProfileFilePayload{
		ID:         entry.ID,
		Path:       entry.Path,
		Type:       entry.Type,
		MimeType:   entry.MimeType,
		SizeBytes:  entry.SizeBytes,
		SHA256:     entry.SHA256,
		StorageKey: entry.StorageKey,
		SortOrder:  entry.SortOrder,
		UpdatedAt:  entry.UpdateAt,
	}
	if entry.Type != "asset" {
		payload.Content = string(content)
	}

	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func getIuinProfileWorkspaceFile(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireUserId()
	if c.Err != nil {
		return
	}

	user, appErr := c.App.GetUser(c.Params.UserId)
	if appErr != nil {
		c.Err = appErr
		return
	}

	entryID := strings.TrimSpace(mux.Vars(r)["entry_id"])
	if !model.IsValidId(entryID) {
		c.SetInvalidURLParam("entry_id")
		return
	}

	db := c.App.Srv().Store().GetInternalReplicaDB()
	workspace, appErr := selectIuinProfileWorkspace(r.Context(), db, user.Id)
	if appErr != nil {
		c.Err = appErr
		return
	}
	if workspace == nil {
		c.Err = newIuinProfileFileNotFoundAppError("getIuinProfileWorkspaceFile")
		return
	}

	entry, appErr := selectIuinProfileEntry(r.Context(), db, workspace.ID, entryID)
	if appErr != nil {
		c.Err = appErr
		return
	}
	if entry == nil || entry.Type == "folder" || entry.StorageKey == "" {
		c.Err = newIuinProfileFileNotFoundAppError("getIuinProfileWorkspaceFile")
		return
	}

	fileReader, appErr := c.App.FileReader(entry.StorageKey)
	if appErr != nil {
		c.Err = newIuinProfileFileNotFoundAppError("getIuinProfileWorkspaceFile")
		return
	}
	defer fileReader.Close()

	mimeType := entry.MimeType
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	disposition := "attachment"
	if isIuinProfileInlineMimeType(mimeType) {
		disposition = "inline"
	}

	w.Header().Set("Cache-Control", "private, max-age=300")
	w.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": entry.Name}))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", entry.SizeBytes))
	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if _, err := io.CopyN(w, fileReader, entry.SizeBytes); err != nil {
		c.Logger.Warn("Error while writing IUIN profile workspace file", mlog.Err(err))
	}
}

func readIuinProfileWorkspace(c *Context, ctx context.Context, userID string) (*iuinProfileWorkspacePayload, *model.AppError) {
	db := c.App.Srv().Store().GetInternalReplicaDB()
	workspace, appErr := selectIuinProfileWorkspace(ctx, db, userID)
	if appErr != nil {
		return nil, appErr
	}
	if workspace == nil {
		return nil, nil
	}

	rows, appErr := selectIuinProfileEntries(ctx, db, workspace.ID)
	if appErr != nil {
		return nil, appErr
	}

	files := make([]iuinProfileFilePayload, 0, len(rows))
	for _, row := range rows {
		file := iuinProfileFilePayload{
			ID:         row.ID,
			Path:       row.Path,
			Type:       row.Type,
			MimeType:   row.MimeType,
			SizeBytes:  row.SizeBytes,
			SHA256:     row.SHA256,
			StorageKey: row.StorageKey,
			SortOrder:  row.SortOrder,
			UpdatedAt:  row.UpdateAt,
		}

		if row.Type != "folder" && row.StorageKey != "" && row.Type != "asset" {
			data, appErr := c.App.ReadFile(row.StorageKey)
			if appErr != nil {
				return nil, appErr
			}
			file.Content = encodeIuinProfileEntryContent(row.Type, row.MimeType, data)
		} else if row.Type == "asset" && row.StorageKey != "" && row.SizeBytes <= iuinProfileExternalReferenceMaxSize {
			data, appErr := c.App.ReadFile(row.StorageKey)
			if appErr != nil {
				return nil, appErr
			}
			if isIuinProfileExternalAssetReference(string(data)) {
				file.Content = string(data)
			}
		}

		files = append(files, file)
	}

	return &iuinProfileWorkspacePayload{
		ID:                 workspace.ID,
		UserID:             workspace.UserID,
		RootName:           workspace.RootName,
		ActivePath:         workspace.ActivePath,
		GitHubRenderedHTML: workspace.GitHubRenderedHTML,
		Files:              files,
		StoragePrefix:      iuinProfileWorkspaceStoragePrefix(userID, workspace.ID),
	}, nil
}

func saveIuinProfileWorkspace(c *Context, ctx context.Context, userID string, payload *iuinProfileWorkspacePayload) (*iuinProfileWorkspacePayload, *model.AppError) {
	db := c.App.Srv().Store().GetInternalMasterDB()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, newIuinProfileWorkspaceAppError("saveIuinProfileWorkspace", http.StatusInternalServerError, err)
	}
	defer tx.Rollback()

	now := model.GetMillis()
	workspace, appErr := getOrCreateIuinProfileWorkspaceTx(ctx, tx, userID, now)
	if appErr != nil {
		return nil, appErr
	}

	oldEntries, appErr := selectIuinProfileEntriesTx(ctx, tx, workspace.ID)
	if appErr != nil {
		return nil, appErr
	}
	oldByPath := make(map[string]iuinProfileEntryRow, len(oldEntries))
	for _, entry := range oldEntries {
		oldByPath[entry.Path] = entry
	}

	pending, activePath, rootName, githubRenderedHTML, appErr := normalizeIuinProfileWorkspacePayload(userID, workspace.ID, now, payload, oldByPath)
	if appErr != nil {
		return nil, appErr
	}

	for _, entry := range pending {
		if entry.Type == "folder" || entry.ReuseStorage {
			continue
		}
		if _, appErr := c.App.WriteFile(bytes.NewReader(entry.Content), entry.StorageKey); appErr != nil {
			return nil, appErr
		}
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE IuinProfileWorkspaces
		SET RootName = $1, ActivePath = $2, GitHubRenderedHtml = $3, UpdateAt = $4
		WHERE Id = $5
	`, rootName, activePath, githubRenderedHTML, now, workspace.ID); err != nil {
		return nil, newIuinProfileWorkspaceAppError("saveIuinProfileWorkspace.updateWorkspace", http.StatusInternalServerError, err)
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM IuinProfileEntries WHERE WorkspaceId = $1`, workspace.ID); err != nil {
		return nil, newIuinProfileWorkspaceAppError("saveIuinProfileWorkspace.deleteEntries", http.StatusInternalServerError, err)
	}

	for _, entry := range pending {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO IuinProfileEntries
				(Id, WorkspaceId, ParentId, Path, Name, Type, MimeType, SizeBytes, Sha256, StorageKey, SortOrder, CreateAt, UpdateAt)
			VALUES
				($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		`, entry.ID, entry.WorkspaceID, entry.ParentID, entry.Path, entry.Name, entry.Type, entry.MimeType, entry.SizeBytes, entry.SHA256, entry.StorageKey, entry.SortOrder, entry.CreateAt, entry.UpdateAt); err != nil {
			return nil, newIuinProfileWorkspaceAppError("saveIuinProfileWorkspace.insertEntry", http.StatusInternalServerError, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, newIuinProfileWorkspaceAppError("saveIuinProfileWorkspace.commit", http.StatusInternalServerError, err)
	}

	removeUnusedIuinProfileStorage(c, oldEntries, pending)

	return readIuinProfileWorkspace(c, ctx, userID)
}

func persistIuinProfileWorkspaceUpload(c *Context, ctx context.Context, userID string, entryPath string, entryType string, mimeType string, content []byte) (*iuinProfileEntryRow, *model.AppError) {
	db := c.App.Srv().Store().GetInternalMasterDB()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, newIuinProfileWorkspaceAppError("persistIuinProfileWorkspaceUpload", http.StatusInternalServerError, err)
	}
	defer tx.Rollback()

	now := model.GetMillis()
	workspace, appErr := getOrCreateIuinProfileWorkspaceTx(ctx, tx, userID, now)
	if appErr != nil {
		return nil, appErr
	}

	entries, appErr := selectIuinProfileEntriesTx(ctx, tx, workspace.ID)
	if appErr != nil {
		return nil, appErr
	}

	parentID := ""
	parentPath := pathpkg.Dir(entryPath)
	if parentPath != "." && parentPath != "/" {
		for _, entry := range entries {
			if entry.Path == parentPath && entry.Type == "folder" {
				parentID = entry.ID
				break
			}
		}
	}

	oldEntry := iuinProfileEntryRow{}
	sortOrder := int64(0)
	hasSibling := false
	for _, entry := range entries {
		if entry.Path == entryPath {
			oldEntry = entry
			continue
		}
		if entry.ParentID == parentID && (!hasSibling || entry.SortOrder >= sortOrder) {
			sortOrder = entry.SortOrder + 1
			hasSibling = true
		}
	}
	if oldEntry.ID != "" {
		if oldEntry.Type == "folder" {
			return nil, model.NewAppError("persistIuinProfileWorkspaceUpload", "api.iuin_profile_workspace.path_conflict", nil, "", http.StatusBadRequest)
		}
		sortOrder = oldEntry.SortOrder
	}

	sum := sha256.Sum256(content)
	entryID := model.NewId()
	entry := &iuinProfileEntryRow{
		ID:          entryID,
		WorkspaceID: workspace.ID,
		ParentID:    parentID,
		Path:        entryPath,
		Name:        pathpkg.Base(entryPath),
		Type:        entryType,
		MimeType:    mimeType,
		SizeBytes:   int64(len(content)),
		SHA256:      fmt.Sprintf("%x", sum),
		StorageKey:  iuinProfileEntryStorageKey(userID, workspace.ID, entryID),
		SortOrder:   sortOrder,
		CreateAt:    now,
		UpdateAt:    now,
	}

	quotaEntries := make([]iuinProfileEntryRow, 0, len(entries)+1)
	for _, existing := range entries {
		if existing.Path != entryPath {
			quotaEntries = append(quotaEntries, existing)
		}
	}
	quotaEntries = append(quotaEntries, *entry)
	if appErr := validateIuinProfileEntryQuota(quotaEntries); appErr != nil {
		return nil, appErr
	}

	if _, appErr := c.App.WriteFile(bytes.NewReader(content), entry.StorageKey); appErr != nil {
		return nil, appErr
	}
	removeWrittenFile := true
	defer func() {
		if removeWrittenFile {
			_ = c.App.RemoveFile(entry.StorageKey)
		}
	}()

	if oldEntry.ID != "" {
		if _, err := tx.ExecContext(ctx, `DELETE FROM IuinProfileEntries WHERE WorkspaceId = $1 AND Id = $2`, workspace.ID, oldEntry.ID); err != nil {
			return nil, newIuinProfileWorkspaceAppError("persistIuinProfileWorkspaceUpload.deleteEntry", http.StatusInternalServerError, err)
		}
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO IuinProfileEntries
			(Id, WorkspaceId, ParentId, Path, Name, Type, MimeType, SizeBytes, Sha256, StorageKey, SortOrder, CreateAt, UpdateAt)
		VALUES
			($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`, entry.ID, entry.WorkspaceID, entry.ParentID, entry.Path, entry.Name, entry.Type, entry.MimeType, entry.SizeBytes, entry.SHA256, entry.StorageKey, entry.SortOrder, entry.CreateAt, entry.UpdateAt); err != nil {
		return nil, newIuinProfileWorkspaceAppError("persistIuinProfileWorkspaceUpload.insertEntry", http.StatusInternalServerError, err)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE IuinProfileWorkspaces SET UpdateAt = $1 WHERE Id = $2`, now, workspace.ID); err != nil {
		return nil, newIuinProfileWorkspaceAppError("persistIuinProfileWorkspaceUpload.updateWorkspace", http.StatusInternalServerError, err)
	}
	if err := tx.Commit(); err != nil {
		return nil, newIuinProfileWorkspaceAppError("persistIuinProfileWorkspaceUpload.commit", http.StatusInternalServerError, err)
	}
	removeWrittenFile = false

	if oldEntry.StorageKey != "" && oldEntry.StorageKey != entry.StorageKey {
		if appErr := c.App.RemoveFile(oldEntry.StorageKey); appErr != nil {
			c.Logger.Warn("Unable to remove replaced IUIN profile workspace file", mlog.String("storage_key", oldEntry.StorageKey), mlog.Err(appErr))
		}
	}

	return entry, nil
}

func selectIuinProfileWorkspace(ctx context.Context, db interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, userID string) (*iuinProfileWorkspaceRow, *model.AppError) {
	row := db.QueryRowContext(ctx, `
		SELECT Id, UserId, RootName, ActivePath, GitHubRenderedHtml, CreateAt, UpdateAt
		FROM IuinProfileWorkspaces
		WHERE UserId = $1 AND DeleteAt = 0
	`, userID)

	workspace := &iuinProfileWorkspaceRow{}
	if err := row.Scan(&workspace.ID, &workspace.UserID, &workspace.RootName, &workspace.ActivePath, &workspace.GitHubRenderedHTML, &workspace.CreateAt, &workspace.UpdateAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, newIuinProfileWorkspaceAppError("selectIuinProfileWorkspace", http.StatusInternalServerError, err)
	}

	return workspace, nil
}

func getOrCreateIuinProfileWorkspaceTx(ctx context.Context, tx *sql.Tx, userID string, now int64) (*iuinProfileWorkspaceRow, *model.AppError) {
	row := tx.QueryRowContext(ctx, `
		SELECT Id, UserId, RootName, ActivePath, GitHubRenderedHtml, CreateAt, UpdateAt
		FROM IuinProfileWorkspaces
		WHERE UserId = $1 AND DeleteAt = 0
		FOR UPDATE
	`, userID)

	workspace := &iuinProfileWorkspaceRow{}
	if err := row.Scan(&workspace.ID, &workspace.UserID, &workspace.RootName, &workspace.ActivePath, &workspace.GitHubRenderedHTML, &workspace.CreateAt, &workspace.UpdateAt); err != nil {
		if err != sql.ErrNoRows {
			return nil, newIuinProfileWorkspaceAppError("getOrCreateIuinProfileWorkspaceTx.select", http.StatusInternalServerError, err)
		}

		workspace = &iuinProfileWorkspaceRow{
			ID:         model.NewId(),
			UserID:     userID,
			RootName:   "profile-readme",
			ActivePath: iuinProfileWorkspaceMainFile,
			CreateAt:   now,
			UpdateAt:   now,
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO IuinProfileWorkspaces
				(Id, UserId, RootName, ActivePath, GitHubRenderedHtml, CreateAt, UpdateAt, DeleteAt)
			VALUES
				($1, $2, $3, $4, $5, $6, $7, 0)
		`, workspace.ID, workspace.UserID, workspace.RootName, workspace.ActivePath, workspace.GitHubRenderedHTML, workspace.CreateAt, workspace.UpdateAt); err != nil {
			return nil, newIuinProfileWorkspaceAppError("getOrCreateIuinProfileWorkspaceTx.insert", http.StatusInternalServerError, err)
		}
	}

	return workspace, nil
}

func selectIuinProfileEntries(ctx context.Context, db interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}, workspaceID string) ([]iuinProfileEntryRow, *model.AppError) {
	rows, err := db.QueryContext(ctx, `
		SELECT Id, WorkspaceId, ParentId, Path, Name, Type, MimeType, SizeBytes, Sha256, StorageKey, SortOrder, CreateAt, UpdateAt
		FROM IuinProfileEntries
		WHERE WorkspaceId = $1
		ORDER BY ParentId ASC, SortOrder ASC, Path ASC
	`, workspaceID)
	if err != nil {
		return nil, newIuinProfileWorkspaceAppError("selectIuinProfileEntries", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	entries := []iuinProfileEntryRow{}
	for rows.Next() {
		var entry iuinProfileEntryRow
		if err := rows.Scan(&entry.ID, &entry.WorkspaceID, &entry.ParentID, &entry.Path, &entry.Name, &entry.Type, &entry.MimeType, &entry.SizeBytes, &entry.SHA256, &entry.StorageKey, &entry.SortOrder, &entry.CreateAt, &entry.UpdateAt); err != nil {
			return nil, newIuinProfileWorkspaceAppError("selectIuinProfileEntries.scan", http.StatusInternalServerError, err)
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, newIuinProfileWorkspaceAppError("selectIuinProfileEntries.rows", http.StatusInternalServerError, err)
	}

	return entries, nil
}

func selectIuinProfileEntry(ctx context.Context, db interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}, workspaceID string, entryID string) (*iuinProfileEntryRow, *model.AppError) {
	row := db.QueryRowContext(ctx, `
		SELECT Id, WorkspaceId, ParentId, Path, Name, Type, MimeType, SizeBytes, Sha256, StorageKey, SortOrder, CreateAt, UpdateAt
		FROM IuinProfileEntries
		WHERE WorkspaceId = $1 AND Id = $2
	`, workspaceID, entryID)

	entry := &iuinProfileEntryRow{}
	if err := row.Scan(&entry.ID, &entry.WorkspaceID, &entry.ParentID, &entry.Path, &entry.Name, &entry.Type, &entry.MimeType, &entry.SizeBytes, &entry.SHA256, &entry.StorageKey, &entry.SortOrder, &entry.CreateAt, &entry.UpdateAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, newIuinProfileWorkspaceAppError("selectIuinProfileEntry", http.StatusInternalServerError, err)
	}

	return entry, nil
}

func selectIuinProfileEntriesTx(ctx context.Context, tx *sql.Tx, workspaceID string) ([]iuinProfileEntryRow, *model.AppError) {
	return selectIuinProfileEntries(ctx, tx, workspaceID)
}

func normalizeIuinProfileWorkspacePayload(userID string, workspaceID string, now int64, payload *iuinProfileWorkspacePayload, oldByPath map[string]iuinProfileEntryRow) ([]pendingIuinProfileEntry, string, string, string, *model.AppError) {
	rootName := sanitizeIuinProfileRootName(payload.RootName)
	githubRenderedHTML := payload.GitHubRenderedHTML
	pendingByPath := map[string]*pendingIuinProfileEntry{}
	oldByID := make(map[string]iuinProfileEntryRow, len(oldByPath))
	for _, entry := range oldByPath {
		oldByID[entry.ID] = entry
	}
	hasExplicitSortOrder := false
	for _, file := range payload.Files {
		if file.SortOrder != 0 {
			hasExplicitSortOrder = true
			break
		}
	}

	var ensureFolder func(folderPath string) *pendingIuinProfileEntry
	ensureFolder = func(folderPath string) *pendingIuinProfileEntry {
		folderPath = sanitizeIuinProfileWorkspacePath(folderPath)
		if folderPath == "" {
			return nil
		}
		if existing := pendingByPath[folderPath]; existing != nil {
			return existing
		}

		parentPath := pathpkg.Dir(folderPath)
		parentID := ""
		if parentPath != "." && parentPath != "/" {
			parent := ensureFolder(parentPath)
			if parent != nil {
				parentID = parent.ID
			}
		}

		old := oldByPath[folderPath]
		entryID := old.ID
		createAt := old.CreateAt
		if entryID == "" {
			entryID = model.NewId()
			createAt = now
		}

		entry := &pendingIuinProfileEntry{iuinProfileEntryRow: iuinProfileEntryRow{
			ID:          entryID,
			WorkspaceID: workspaceID,
			ParentID:    parentID,
			Path:        folderPath,
			Name:        pathpkg.Base(folderPath),
			Type:        "folder",
			SortOrder:   int64(len(pendingByPath)),
			CreateAt:    createAt,
			UpdateAt:    now,
		}}
		pendingByPath[folderPath] = entry
		return entry
	}

	for fileIndex, file := range payload.Files {
		entryPath := sanitizeIuinProfileWorkspacePath(file.Path)
		if entryPath == "" {
			continue
		}

		entryType, appErr := normalizeIuinProfileEntryType(file.Type, entryPath, file.Content)
		if appErr != nil {
			return nil, "", "", "", appErr
		}

		parentPath := pathpkg.Dir(entryPath)
		parentID := ""
		if parentPath != "." && parentPath != "/" {
			parent := ensureFolder(parentPath)
			if parent != nil {
				parentID = parent.ID
			}
		}

		if entryType == "folder" {
			folder := ensureFolder(entryPath)
			if folder != nil {
				folder.SortOrder = file.SortOrder
				if !hasExplicitSortOrder {
					folder.SortOrder = int64(fileIndex)
				}
			}
			continue
		}

		if old, ok := reusableIuinProfileAssetEntry(file, entryType, oldByID); ok {
			updateAt := file.UpdatedAt
			if updateAt == 0 {
				updateAt = now
			}
			pendingByPath[entryPath] = &pendingIuinProfileEntry{
				iuinProfileEntryRow: iuinProfileEntryRow{
					ID:          old.ID,
					WorkspaceID: workspaceID,
					ParentID:    parentID,
					Path:        entryPath,
					Name:        pathpkg.Base(entryPath),
					Type:        old.Type,
					MimeType:    old.MimeType,
					SizeBytes:   old.SizeBytes,
					SHA256:      old.SHA256,
					StorageKey:  old.StorageKey,
					SortOrder:   file.SortOrder,
					CreateAt:    old.CreateAt,
					UpdateAt:    updateAt,
				},
				ReuseStorage: true,
			}
			if !hasExplicitSortOrder {
				pendingByPath[entryPath].SortOrder = int64(fileIndex)
			}
			continue
		}

		old := oldByPath[entryPath]
		entryID := old.ID
		createAt := old.CreateAt
		if entryID == "" {
			entryID = model.NewId()
			createAt = now
		}

		content, mimeType, appErr := decodeIuinProfileEntryContent(file)
		if appErr != nil {
			return nil, "", "", "", appErr
		}
		if mimeType == "" {
			mimeType = detectIuinProfileMimeType(entryPath, content)
		}
		sum := sha256.Sum256(content)

		updateAt := file.UpdatedAt
		if updateAt == 0 {
			updateAt = now
		}

		pendingByPath[entryPath] = &pendingIuinProfileEntry{
			iuinProfileEntryRow: iuinProfileEntryRow{
				ID:          entryID,
				WorkspaceID: workspaceID,
				ParentID:    parentID,
				Path:        entryPath,
				Name:        pathpkg.Base(entryPath),
				Type:        entryType,
				MimeType:    mimeType,
				SizeBytes:   int64(len(content)),
				SHA256:      fmt.Sprintf("%x", sum),
				StorageKey:  iuinProfileEntryStorageKey(userID, workspaceID, entryID),
				SortOrder:   file.SortOrder,
				CreateAt:    createAt,
				UpdateAt:    updateAt,
			},
			Content: content,
		}
		if !hasExplicitSortOrder {
			pendingByPath[entryPath].SortOrder = int64(fileIndex)
		}
	}

	activePath := sanitizeIuinProfileWorkspacePath(payload.ActivePath)
	if activePath == "" || !isIuinProfileMainDocumentEntry(pendingByPath[activePath]) {
		if isIuinProfileMainDocumentEntry(pendingByPath[iuinProfileWorkspaceMainFile]) {
			activePath = iuinProfileWorkspaceMainFile
		} else {
			activePath = firstIuinProfileMainDocumentPath(pendingByPath)
		}
	}

	quotaEntries := make([]iuinProfileEntryRow, 0, len(pendingByPath))
	for _, entry := range pendingByPath {
		quotaEntries = append(quotaEntries, entry.iuinProfileEntryRow)
	}
	if appErr := validateIuinProfileEntryQuota(quotaEntries); appErr != nil {
		return nil, "", "", "", appErr
	}

	pending := make([]pendingIuinProfileEntry, 0, len(pendingByPath))
	for _, entry := range pendingByPath {
		pending = append(pending, *entry)
	}
	sort.Slice(pending, func(i, j int) bool {
		if pending[i].ParentID != pending[j].ParentID {
			return pending[i].ParentID < pending[j].ParentID
		}
		if pending[i].SortOrder != pending[j].SortOrder {
			return pending[i].SortOrder < pending[j].SortOrder
		}
		return pending[i].Path < pending[j].Path
	})

	return pending, activePath, rootName, githubRenderedHTML, nil
}

func removeUnusedIuinProfileStorage(c *Context, oldEntries []iuinProfileEntryRow, pending []pendingIuinProfileEntry) {
	used := make(map[string]bool, len(pending))
	for _, entry := range pending {
		if entry.StorageKey != "" {
			used[entry.StorageKey] = true
		}
	}

	for _, entry := range oldEntries {
		if entry.StorageKey == "" || used[entry.StorageKey] {
			continue
		}
		if appErr := c.App.RemoveFile(entry.StorageKey); appErr != nil {
			c.Logger.Warn("Unable to remove old IUIN profile workspace file", mlog.String("storage_key", entry.StorageKey), mlog.Err(appErr))
		}
	}
}

func defaultIuinProfileWorkspacePayload(user *model.User) *iuinProfileWorkspacePayload {
	return &iuinProfileWorkspacePayload{
		UserID:     user.Id,
		RootName:   sanitizeIuinProfileRootName(user.Username + "-profile-readme"),
		ActivePath: iuinProfileWorkspaceMainFile,
		Files: []iuinProfileFilePayload{{
			Path:      iuinProfileWorkspaceMainFile,
			Content:   defaultIuinProfileReadme(user),
			Type:      "markdown",
			UpdatedAt: model.GetMillis(),
		}},
	}
}

func defaultIuinProfileReadme(user *model.User) string {
	name := strings.TrimSpace(strings.Join([]string{user.FirstName, user.LastName}, " "))
	if name == "" {
		name = strings.TrimSpace(user.Nickname)
	}
	if name == "" {
		name = strings.TrimSpace(user.Username)
	}
	if name == "" {
		name = "IUIN Member"
	}

	position := strings.TrimSpace(user.Position)
	if position == "" {
		position = "Research member"
	}

	name = strings.NewReplacer("\n", " ", "\r", " ").Replace(name)
	position = strings.NewReplacer("\n", " ", "\r", " ").Replace(position)

	return strings.Join([]string{
		"# " + name,
		"",
		fmt.Sprintf("%s is a %s. You can introduce research directions, projects, papers, awards, course materials, and useful links here.", name, position),
	}, "\n")
}

func sanitizeIuinProfileRootName(value string) string {
	value = strings.ReplaceAll(value, "\\", "/")
	segments := strings.FieldsFunc(value, func(r rune) bool {
		return r == '/' || r == '\n' || r == '\r' || r == '\t'
	})
	cleaned := make([]string, 0, len(segments))
	for _, segment := range segments {
		segment = strings.TrimSpace(segment)
		if segment == "" || segment == "." || segment == ".." {
			continue
		}
		cleaned = append(cleaned, segment)
	}
	if len(cleaned) == 0 {
		return "profile-readme"
	}
	return strings.Join(cleaned, "-")
}

func sanitizeIuinProfileWorkspacePath(value string) string {
	value = strings.ReplaceAll(value, "\\", "/")
	parts := strings.Split(value, "/")
	cleaned := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" || part == "." || part == ".." {
			continue
		}
		cleaned = append(cleaned, part)
	}
	return strings.Join(cleaned, "/")
}

func normalizeIuinProfileEntryType(value string, entryPath string, content string) (string, *model.AppError) {
	switch value {
	case "folder", "markdown", "text", "asset":
		return value, nil
	case "":
		if strings.HasPrefix(content, "data:image/") || isIuinProfileAssetPath(entryPath) {
			return "asset", nil
		}
		if strings.HasSuffix(strings.ToLower(entryPath), ".md") || strings.HasSuffix(strings.ToLower(entryPath), ".markdown") {
			return "markdown", nil
		}
		return "text", nil
	default:
		return "", model.NewAppError("normalizeIuinProfileEntryType", "api.iuin_profile_workspace.invalid_type", map[string]any{"Type": value}, "", http.StatusBadRequest)
	}
}

func decodeIuinProfileEntryContent(file iuinProfileFilePayload) ([]byte, string, *model.AppError) {
	if strings.HasPrefix(file.Content, "data:") {
		data, mimeType, err := decodeIuinProfileDataURL(file.Content)
		if err != nil {
			return nil, "", model.NewAppError("decodeIuinProfileEntryContent", "api.iuin_profile_workspace.invalid_data_url", nil, "", http.StatusBadRequest).Wrap(err)
		}
		return data, firstNonEmpty(file.MimeType, mimeType), nil
	}

	return []byte(file.Content), file.MimeType, nil
}

func decodeIuinProfileDataURL(value string) ([]byte, string, error) {
	comma := strings.Index(value, ",")
	if comma < 0 {
		return nil, "", fmt.Errorf("missing data URL comma")
	}

	header := strings.TrimPrefix(value[:comma], "data:")
	body := value[comma+1:]
	parts := strings.Split(header, ";")
	mimeType := ""
	if len(parts) > 0 {
		mimeType = parts[0]
	}

	if strings.Contains(header, ";base64") {
		data, err := base64.StdEncoding.DecodeString(body)
		if err != nil {
			return nil, "", err
		}
		return data, mimeType, nil
	}

	decoded, err := url.QueryUnescape(body)
	if err != nil {
		return nil, "", err
	}
	return []byte(decoded), mimeType, nil
}

func encodeIuinProfileEntryContent(entryType string, mimeType string, data []byte) string {
	content := string(data)
	if entryType != "asset" {
		return content
	}
	if strings.HasPrefix(content, "data:") || strings.HasPrefix(content, "http://") || strings.HasPrefix(content, "https://") {
		return content
	}
	if mimeType == "" {
		mimeType = http.DetectContentType(data)
	}
	return fmt.Sprintf("data:%s;base64,%s", mimeType, base64.StdEncoding.EncodeToString(data))
}

func detectIuinProfileMimeType(entryPath string, content []byte) string {
	if byExt := mime.TypeByExtension(pathpkg.Ext(entryPath)); byExt != "" {
		return byExt
	}
	if len(content) > 0 {
		return http.DetectContentType(content)
	}
	return "application/octet-stream"
}

func isIuinProfileMainDocumentEntry(entry *pendingIuinProfileEntry) bool {
	if entry == nil || entry.Type != "markdown" {
		return false
	}

	extension := strings.ToLower(pathpkg.Ext(entry.Path))
	return extension == ".md" || extension == ".markdown"
}

func firstIuinProfileMainDocumentPath(entries map[string]*pendingIuinProfileEntry) string {
	paths := make([]string, 0, len(entries))
	for entryPath, entry := range entries {
		if isIuinProfileMainDocumentEntry(entry) {
			paths = append(paths, entryPath)
		}
	}
	sort.Strings(paths)
	if len(paths) == 0 {
		return ""
	}
	return paths[0]
}

func iuinProfileWorkspaceStoragePrefix(userID string, workspaceID string) string {
	return fmt.Sprintf("%s/users/%s/workspaces/%s", iuinProfileStorageRoot, userID, workspaceID)
}

func iuinProfileEntryStorageKey(userID string, workspaceID string, entryID string) string {
	return fmt.Sprintf("%s/entries/%s/%s", iuinProfileWorkspaceStoragePrefix(userID, workspaceID), entryID, iuinProfileEntryBlobName)
}

func isIuinProfileAssetPath(entryPath string) bool {
	lower := strings.ToLower(entryPath)
	assetExtensions := []string{
		".7z", ".avif", ".bmp", ".doc", ".docx", ".gif", ".gz", ".ico", ".jpeg", ".jpg",
		".mp3", ".mp4", ".ods", ".odt", ".pdf", ".png", ".ppt", ".pptx", ".rar", ".svg",
		".tar", ".wav", ".webm", ".webp", ".xls", ".xlsx", ".zip",
	}
	for _, extension := range assetExtensions {
		if strings.HasSuffix(lower, extension) {
			return true
		}
	}
	return false
}

func reusableIuinProfileAssetEntry(file iuinProfileFilePayload, entryType string, oldByID map[string]iuinProfileEntryRow) (iuinProfileEntryRow, bool) {
	if entryType != "asset" || file.ID == "" || file.StorageKey == "" || file.SHA256 == "" {
		return iuinProfileEntryRow{}, false
	}

	old, ok := oldByID[file.ID]
	if !ok || old.Type != "asset" || old.StorageKey == "" {
		return iuinProfileEntryRow{}, false
	}
	if file.StorageKey != old.StorageKey || file.SHA256 != old.SHA256 || file.SizeBytes != old.SizeBytes {
		return iuinProfileEntryRow{}, false
	}

	return old, true
}

func validateIuinProfileEntryQuota(entries []iuinProfileEntryRow) *model.AppError {
	totalSize := int64(0)
	for _, entry := range entries {
		if entry.Type == "folder" {
			continue
		}
		if entry.SizeBytes < 0 {
			return model.NewAppError("validateIuinProfileEntryQuota", "api.iuin_profile_workspace.invalid_size", nil, "", http.StatusBadRequest)
		}
		if entry.SizeBytes > iuinProfileFileMaxBytes {
			return newIuinProfileFileTooLargeAppError("validateIuinProfileEntryQuota")
		}
		if totalSize > iuinProfileWorkspaceMaxBytes-entry.SizeBytes {
			return newIuinProfileWorkspaceTooLargeAppError("validateIuinProfileEntryQuota")
		}
		totalSize += entry.SizeBytes
	}

	return nil
}

func normalizeIuinProfileUploadMimeType(value string, content []byte) string {
	mediaType, _, err := mime.ParseMediaType(strings.TrimSpace(value))
	if err != nil || mediaType == "" || len(mediaType) > 128 {
		mediaType = ""
	}
	if mediaType == "" || strings.EqualFold(mediaType, "application/octet-stream") {
		mediaType = http.DetectContentType(content)
	}
	if len(mediaType) > 128 {
		return "application/octet-stream"
	}
	return strings.ToLower(mediaType)
}

func firstIuinProfileMultipartValue(r *http.Request, key string) string {
	if r.MultipartForm == nil {
		return ""
	}
	values := r.MultipartForm.Value[key]
	if len(values) == 0 {
		return ""
	}
	return strings.TrimSpace(values[0])
}

func isIuinProfileExternalAssetReference(value string) bool {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Host == "" {
		return false
	}
	return parsed.Scheme == "http" || parsed.Scheme == "https"
}

func isIuinProfileInlineMimeType(value string) bool {
	mediaType, _, err := mime.ParseMediaType(value)
	if err != nil {
		return false
	}
	switch strings.ToLower(mediaType) {
	case "image/avif", "image/bmp", "image/gif", "image/jpeg", "image/png", "image/webp", "image/x-icon":
		return true
	default:
		return false
	}
}

func newIuinProfileFileTooLargeAppError(where string) *model.AppError {
	return model.NewAppError(where, "api.iuin_profile_workspace.file_too_large", nil, "", http.StatusRequestEntityTooLarge)
}

func newIuinProfileWorkspaceTooLargeAppError(where string) *model.AppError {
	return model.NewAppError(where, "api.iuin_profile_workspace.workspace_too_large", nil, "", http.StatusRequestEntityTooLarge)
}

func newIuinProfileFileNotFoundAppError(where string) *model.AppError {
	return model.NewAppError(where, "api.iuin_profile_workspace.file_not_found", nil, "", http.StatusNotFound)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func newIuinProfileWorkspaceAppError(where string, statusCode int, err error) *model.AppError {
	return model.NewAppError(where, "api.iuin_profile_workspace.storage_error", nil, "", statusCode).Wrap(err)
}
