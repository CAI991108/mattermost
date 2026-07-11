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
	"fmt"
	"mime"
	"net/http"
	"net/url"
	pathpkg "path"
	"sort"
	"strings"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

const (
	iuinProfileWorkspaceMainFile = "README.md"
	iuinProfileStorageRoot       = "iuin_profile"
	iuinProfileEntryBlobName     = "original"
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
	CreateAt    int64
	UpdateAt    int64
}

type pendingIuinProfileEntry struct {
	iuinProfileEntryRow
	Content []byte
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

	var payload iuinProfileWorkspacePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
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
			UpdatedAt:  row.UpdateAt,
		}

		if row.Type != "folder" && row.StorageKey != "" {
			data, appErr := c.App.ReadFile(row.StorageKey)
			if appErr != nil {
				return nil, appErr
			}
			file.Content = encodeIuinProfileEntryContent(row.Type, row.MimeType, data)
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
		if entry.Type == "folder" {
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
				(Id, WorkspaceId, ParentId, Path, Name, Type, MimeType, SizeBytes, Sha256, StorageKey, CreateAt, UpdateAt)
			VALUES
				($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		`, entry.ID, entry.WorkspaceID, entry.ParentID, entry.Path, entry.Name, entry.Type, entry.MimeType, entry.SizeBytes, entry.SHA256, entry.StorageKey, entry.CreateAt, entry.UpdateAt); err != nil {
			return nil, newIuinProfileWorkspaceAppError("saveIuinProfileWorkspace.insertEntry", http.StatusInternalServerError, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, newIuinProfileWorkspaceAppError("saveIuinProfileWorkspace.commit", http.StatusInternalServerError, err)
	}

	removeUnusedIuinProfileStorage(c, oldEntries, pending)

	return readIuinProfileWorkspace(c, ctx, userID)
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
		SELECT Id, WorkspaceId, ParentId, Path, Name, Type, MimeType, SizeBytes, Sha256, StorageKey, CreateAt, UpdateAt
		FROM IuinProfileEntries
		WHERE WorkspaceId = $1
		ORDER BY Path ASC
	`, workspaceID)
	if err != nil {
		return nil, newIuinProfileWorkspaceAppError("selectIuinProfileEntries", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	entries := []iuinProfileEntryRow{}
	for rows.Next() {
		var entry iuinProfileEntryRow
		if err := rows.Scan(&entry.ID, &entry.WorkspaceID, &entry.ParentID, &entry.Path, &entry.Name, &entry.Type, &entry.MimeType, &entry.SizeBytes, &entry.SHA256, &entry.StorageKey, &entry.CreateAt, &entry.UpdateAt); err != nil {
			return nil, newIuinProfileWorkspaceAppError("selectIuinProfileEntries.scan", http.StatusInternalServerError, err)
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, newIuinProfileWorkspaceAppError("selectIuinProfileEntries.rows", http.StatusInternalServerError, err)
	}

	return entries, nil
}

func selectIuinProfileEntriesTx(ctx context.Context, tx *sql.Tx, workspaceID string) ([]iuinProfileEntryRow, *model.AppError) {
	return selectIuinProfileEntries(ctx, tx, workspaceID)
}

func normalizeIuinProfileWorkspacePayload(userID string, workspaceID string, now int64, payload *iuinProfileWorkspacePayload, oldByPath map[string]iuinProfileEntryRow) ([]pendingIuinProfileEntry, string, string, string, *model.AppError) {
	rootName := sanitizeIuinProfileRootName(payload.RootName)
	githubRenderedHTML := payload.GitHubRenderedHTML
	pendingByPath := map[string]*pendingIuinProfileEntry{}

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
			CreateAt:    createAt,
			UpdateAt:    now,
		}}
		pendingByPath[folderPath] = entry
		return entry
	}

	for _, file := range payload.Files {
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
			ensureFolder(entryPath)
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
				CreateAt:    createAt,
				UpdateAt:    updateAt,
			},
			Content: content,
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

	pending := make([]pendingIuinProfileEntry, 0, len(pendingByPath))
	for _, entry := range pendingByPath {
		pending = append(pending, *entry)
	}
	sort.Slice(pending, func(i, j int) bool {
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
	return strings.HasSuffix(lower, ".gif") ||
		strings.HasSuffix(lower, ".png") ||
		strings.HasSuffix(lower, ".jpg") ||
		strings.HasSuffix(lower, ".jpeg") ||
		strings.HasSuffix(lower, ".webp") ||
		strings.HasSuffix(lower, ".svg")
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
