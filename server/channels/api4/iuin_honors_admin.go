// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	stddraw "image/draw"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"math"
	"mime/multipart"
	"net/http"
	pathpkg "path"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const (
	iuinHonorAdminAssetReadLimit = 25 * 1024 * 1024
	iuinHonorAdminAssetMaxBytes  = 10 * 1024 * 1024
	iuinHonorAdminAuditPageSize  = 100
	iuinHonorFrameCanvasSize     = 512
	iuinHonorImageCanvasWidth    = 512
	iuinHonorImageCanvasHeight   = 512
)

var iuinHonorAdminUsers = map[string]bool{
	"litangchao": true,
	"fengyizhan": true,
	"liuxinyu":   true,
	"caizijin":   true,
	"leizexin":   true,
}

var iuinHonorAuditUsers = map[string]bool{
	"litangchao": true,
	"fengyizhan": true,
	"liuxinyu":   true,
	"caizijin":   true,
	"leizexin":   true,
}

type iuinHonorAdminSessionResponse struct {
	Username string `json:"username"`
	CanAudit bool   `json:"canAudit"`
}

type iuinHonorAdminItem struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Description       string `json:"description"`
	IconStorageKey    string `json:"iconStorageKey"`
	Category          string `json:"category"`
	Rarity            string `json:"rarity"`
	UnlockHint        string `json:"unlockHint"`
	FrameStorageKey   string `json:"frameStorageKey"`
	PreviewStorageKey string `json:"previewStorageKey"`
	SortOrder         int    `json:"sortOrder"`
	ContributorUserID string `json:"contributorUserId"`
	ContributorName   string `json:"contributorUsername"`
}

type iuinHonorAdminListResponse struct {
	Items []iuinHonorAdminItem `json:"items"`
}

type iuinHonorAdminAssetResponse struct {
	StorageKey string `json:"storageKey"`
	SHA256     string `json:"sha256"`
	SizeBytes  int64  `json:"sizeBytes"`
	MimeType   string `json:"mimeType"`
}

type iuinHonorAdminAuditItem struct {
	ID            string `json:"id"`
	ActorUserID   string `json:"actorUserId"`
	ActorUsername string `json:"actorUsername"`
	Action        string `json:"action"`
	TargetType    string `json:"targetType"`
	TargetID      string `json:"targetId"`
	Summary       string `json:"summary"`
	BeforePayload string `json:"beforePayload"`
	AfterPayload  string `json:"afterPayload"`
	CreateAt      int64  `json:"createAt"`
}

type iuinHonorAdminAuditListResponse struct {
	Audits []iuinHonorAdminAuditItem `json:"audits"`
}

type iuinHonorAdminDraft struct {
	DraftID       string             `json:"draftId"`
	OwnerUserID   string             `json:"ownerUserId"`
	OwnerUsername string             `json:"ownerUsername"`
	Kind          string             `json:"kind"`
	Item          iuinHonorAdminItem `json:"item"`
	CreateAt      int64              `json:"createAt"`
	UpdateAt      int64              `json:"updateAt"`
}

type iuinHonorAdminDraftListResponse struct {
	Drafts []iuinHonorAdminDraft `json:"drafts"`
}

type iuinHonorAdminDraftSaveRequest struct {
	Kind string             `json:"kind"`
	Item iuinHonorAdminItem `json:"item"`
}

type iuinHonorAdminReorderRequest struct {
	IDs []string `json:"ids"`
}

type iuinHonorAdminAssetData struct {
	Content  []byte
	MimeType string
	Ext      string
	SHA256   string
}

type iuinHonorAdminFrameCrop struct {
	Enabled    bool
	OutputSize int
	X          float64
	Y          float64
	Width      float64
	Height     float64
}

type iuinHonorAdminImageCrop struct {
	Enabled      bool
	OutputWidth  int
	OutputHeight int
	X            float64
	Y            float64
	Width        float64
	Height       float64
}

type iuinHonorAdminExecutor interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func (api *API) InitIuinHonorAdmin() {
	iuin := api.BaseRoutes.APIRoot.PathPrefix("/iuin").Subrouter()

	iuin.Handle("/honors_admin/session", api.APISessionRequired(getIuinHonorAdminSession)).Methods(http.MethodGet)
	iuin.Handle("/honors_admin/items/{kind:[A-Za-z_]+}", api.APISessionRequired(listIuinHonorAdminItems)).Methods(http.MethodGet)
	iuin.Handle("/honors_admin/items/{kind:[A-Za-z_]+}", api.APISessionRequired(createIuinHonorAdminItem)).Methods(http.MethodPost)
	iuin.Handle("/honors_admin/items/{kind:[A-Za-z_]+}/order", api.APISessionRequired(reorderIuinHonorAdminItems)).Methods(http.MethodPut)
	iuin.Handle("/honors_admin/items/{kind:[A-Za-z_]+}/{item_id:[A-Za-z0-9_-]+}", api.APISessionRequired(updateIuinHonorAdminItem)).Methods(http.MethodPut)
	iuin.Handle("/honors_admin/items/{kind:[A-Za-z_]+}/{item_id:[A-Za-z0-9_-]+}", api.APISessionRequired(deleteIuinHonorAdminItem)).Methods(http.MethodDelete)
	iuin.Handle("/honors_admin/drafts", api.APISessionRequired(listIuinHonorAdminDrafts)).Methods(http.MethodGet)
	iuin.Handle("/honors_admin/drafts", api.APISessionRequired(createIuinHonorAdminDraft)).Methods(http.MethodPost)
	iuin.Handle("/honors_admin/drafts/{draft_id:[A-Za-z0-9]+}", api.APISessionRequired(updateIuinHonorAdminDraft)).Methods(http.MethodPut)
	iuin.Handle("/honors_admin/drafts/{draft_id:[A-Za-z0-9]+}", api.APISessionRequired(deleteIuinHonorAdminDraft)).Methods(http.MethodDelete)
	iuin.Handle("/honors_admin/drafts/{draft_id:[A-Za-z0-9]+}/publish", api.APISessionRequired(publishIuinHonorAdminDraft)).Methods(http.MethodPost)
	iuin.Handle("/honors_admin/assets", api.APISessionRequired(uploadIuinHonorAdminAsset, handlerParamFileAPI)).Methods(http.MethodPost)
	iuin.Handle("/honors_admin/audits", api.APISessionRequired(listIuinHonorAdminAudits)).Methods(http.MethodGet)
}

func getIuinHonorAdminSession(c *Context, w http.ResponseWriter, r *http.Request) {
	user, ok := requireIuinHonorAdmin(c, false)
	if !ok {
		return
	}

	writeIuinHonorsJSON(c, w, iuinHonorAdminSessionResponse{
		Username: user.Username,
		CanAudit: iuinHonorAuditUsers[user.Username],
	})
}

func listIuinHonorAdminItems(c *Context, w http.ResponseWriter, r *http.Request) {
	if _, ok := requireIuinHonorAdmin(c, false); !ok {
		return
	}

	kind, ok := normalizeIuinHonorAdminKind(mux.Vars(r)["kind"])
	if !ok {
		c.SetInvalidURLParam("kind")
		return
	}

	items, appErr := selectIuinHonorAdminItems(r.Context(), c.App.Srv().Store().GetInternalReplicaDB(), kind)
	if appErr != nil {
		c.Err = appErr
		return
	}

	writeIuinHonorsJSON(c, w, iuinHonorAdminListResponse{Items: items})
}

func createIuinHonorAdminItem(c *Context, w http.ResponseWriter, r *http.Request) {
	actor, ok := requireIuinHonorAdmin(c, false)
	if !ok {
		return
	}

	kind, ok := normalizeIuinHonorAdminKind(mux.Vars(r)["kind"])
	if !ok {
		c.SetInvalidURLParam("kind")
		return
	}

	var item iuinHonorAdminItem
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		c.SetInvalidParamWithErr("item", err)
		return
	}
	item.ID = strings.TrimSpace(item.ID)
	if item.ID == "" {
		item.ID = newIuinHonorAdminItemID(kind)
	}
	if appErr := validateIuinHonorAdminItem(kind, item, true); appErr != nil {
		c.Err = appErr
		return
	}

	db := c.App.Srv().Store().GetInternalMasterDB()
	if appErr := insertIuinHonorAdminItem(r.Context(), db, kind, item, actor); appErr != nil {
		c.Err = appErr
		return
	}
	if appErr := insertIuinHonorAdminAudit(r.Context(), db, actor, "create", kind, item.ID, "Created "+item.Name, "", mustMarshalIuinHonorAdminJSON(item)); appErr != nil {
		c.Err = appErr
		return
	}

	w.WriteHeader(http.StatusCreated)
	writeIuinHonorsJSON(c, w, item)
}

func updateIuinHonorAdminItem(c *Context, w http.ResponseWriter, r *http.Request) {
	actor, ok := requireIuinHonorAdmin(c, false)
	if !ok {
		return
	}

	kind, ok := normalizeIuinHonorAdminKind(mux.Vars(r)["kind"])
	if !ok {
		c.SetInvalidURLParam("kind")
		return
	}
	itemID := strings.TrimSpace(mux.Vars(r)["item_id"])

	var item iuinHonorAdminItem
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		c.SetInvalidParamWithErr("item", err)
		return
	}
	item.ID = strings.TrimSpace(item.ID)
	if item.ID == "" {
		item.ID = itemID
	}
	if appErr := validateIuinHonorAdminItem(kind, item, false); appErr != nil {
		c.Err = appErr
		return
	}

	db := c.App.Srv().Store().GetInternalMasterDB()
	before, appErr := selectIuinHonorAdminItem(r.Context(), db, kind, itemID)
	if appErr != nil {
		c.Err = appErr
		return
	}
	if appErr := updateIuinHonorAdminItemRow(r.Context(), db, kind, itemID, item); appErr != nil {
		c.Err = appErr
		return
	}
	if appErr := removeIuinHonorAdminReplacedAssets(c, before, item); appErr != nil {
		c.Logger.Warn("Failed to remove replaced IUIN honor asset", mlog.Err(appErr))
	}
	if appErr := insertIuinHonorAdminAudit(r.Context(), db, actor, "update", kind, item.ID, describeIuinHonorAdminChange(kind, *before, item), mustMarshalIuinHonorAdminJSON(before), mustMarshalIuinHonorAdminJSON(item)); appErr != nil {
		c.Err = appErr
		return
	}

	writeIuinHonorsJSON(c, w, item)
}

func deleteIuinHonorAdminItem(c *Context, w http.ResponseWriter, r *http.Request) {
	actor, ok := requireIuinHonorAdmin(c, false)
	if !ok {
		return
	}

	kind, ok := normalizeIuinHonorAdminKind(mux.Vars(r)["kind"])
	if !ok {
		c.SetInvalidURLParam("kind")
		return
	}
	itemID := strings.TrimSpace(mux.Vars(r)["item_id"])

	db := c.App.Srv().Store().GetInternalMasterDB()
	before, appErr := selectIuinHonorAdminItem(r.Context(), db, kind, itemID)
	if appErr != nil {
		c.Err = appErr
		return
	}
	if appErr := hardDeleteIuinHonorAdminItem(r.Context(), db, kind, itemID); appErr != nil {
		c.Err = appErr
		return
	}
	if appErr := removeIuinHonorAdminItemAssets(c, *before); appErr != nil {
		c.Logger.Warn("Failed to remove deleted IUIN honor assets", mlog.Err(appErr))
	}
	if appErr := insertIuinHonorAdminAudit(r.Context(), db, actor, "delete", kind, itemID, "Deleted "+before.Name, mustMarshalIuinHonorAdminJSON(before), ""); appErr != nil {
		c.Err = appErr
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func reorderIuinHonorAdminItems(c *Context, w http.ResponseWriter, r *http.Request) {
	actor, ok := requireIuinHonorAdmin(c, false)
	if !ok {
		return
	}

	kind, ok := normalizeIuinHonorAdminKind(mux.Vars(r)["kind"])
	if !ok {
		c.SetInvalidURLParam("kind")
		return
	}

	var request iuinHonorAdminReorderRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		c.SetInvalidParamWithErr("ids", err)
		return
	}

	ids := make([]string, 0, len(request.IDs))
	seen := map[string]bool{}
	for _, rawID := range request.IDs {
		itemID := strings.TrimSpace(rawID)
		if !isValidIuinHonorAdminID(itemID) || seen[itemID] {
			c.SetInvalidParam("ids")
			return
		}
		seen[itemID] = true
		ids = append(ids, itemID)
	}

	db := c.App.Srv().Store().GetInternalMasterDB()
	before, appErr := selectIuinHonorAdminItemIDs(r.Context(), db, kind)
	if appErr != nil {
		c.Err = appErr
		return
	}
	if appErr := reorderIuinHonorAdminItemRows(r.Context(), db, actor, kind, before, ids); appErr != nil {
		c.Err = appErr
		return
	}

	items, appErr := selectIuinHonorAdminItems(r.Context(), db, kind)
	if appErr != nil {
		c.Err = appErr
		return
	}
	writeIuinHonorsJSON(c, w, iuinHonorAdminListResponse{Items: items})
}

func listIuinHonorAdminDrafts(c *Context, w http.ResponseWriter, r *http.Request) {
	actor, ok := requireIuinHonorAdmin(c, false)
	if !ok {
		return
	}

	drafts, appErr := selectIuinHonorAdminDrafts(r.Context(), c.App.Srv().Store().GetInternalReplicaDB(), actor.Id)
	if appErr != nil {
		c.Err = appErr
		return
	}

	writeIuinHonorsJSON(c, w, iuinHonorAdminDraftListResponse{Drafts: drafts})
}

func createIuinHonorAdminDraft(c *Context, w http.ResponseWriter, r *http.Request) {
	actor, ok := requireIuinHonorAdmin(c, false)
	if !ok {
		return
	}

	draft, appErr := decodeIuinHonorAdminDraftRequest(r, actor, "")
	if appErr != nil {
		c.Err = appErr
		return
	}

	db := c.App.Srv().Store().GetInternalMasterDB()
	if appErr := insertIuinHonorAdminDraft(r.Context(), db, draft); appErr != nil {
		c.Err = appErr
		return
	}
	if appErr := insertIuinHonorAdminAudit(r.Context(), db, actor, "draft_create", "draft", draft.DraftID, "Saved draft "+draft.Item.Name, "", mustMarshalIuinHonorAdminJSON(draft)); appErr != nil {
		c.Err = appErr
		return
	}

	w.WriteHeader(http.StatusCreated)
	writeIuinHonorsJSON(c, w, draft)
}

func updateIuinHonorAdminDraft(c *Context, w http.ResponseWriter, r *http.Request) {
	actor, ok := requireIuinHonorAdmin(c, false)
	if !ok {
		return
	}

	draftID := strings.TrimSpace(mux.Vars(r)["draft_id"])
	draft, appErr := decodeIuinHonorAdminDraftRequest(r, actor, draftID)
	if appErr != nil {
		c.Err = appErr
		return
	}

	db := c.App.Srv().Store().GetInternalMasterDB()
	before, appErr := selectIuinHonorAdminDraft(r.Context(), db, actor.Id, draftID)
	if appErr != nil {
		c.Err = appErr
		return
	}
	if appErr := updateIuinHonorAdminDraftRow(r.Context(), db, draft); appErr != nil {
		c.Err = appErr
		return
	}
	if appErr := removeIuinHonorAdminReplacedAssets(c, &before.Item, draft.Item); appErr != nil {
		c.Logger.Warn("Failed to remove replaced IUIN honor draft asset", mlog.Err(appErr))
	}
	if appErr := insertIuinHonorAdminAudit(r.Context(), db, actor, "draft_update", "draft", draft.DraftID, describeIuinHonorAdminChange(draft.Kind, before.Item, draft.Item), mustMarshalIuinHonorAdminJSON(before), mustMarshalIuinHonorAdminJSON(draft)); appErr != nil {
		c.Err = appErr
		return
	}

	writeIuinHonorsJSON(c, w, draft)
}

func deleteIuinHonorAdminDraft(c *Context, w http.ResponseWriter, r *http.Request) {
	actor, ok := requireIuinHonorAdmin(c, false)
	if !ok {
		return
	}

	draftID := strings.TrimSpace(mux.Vars(r)["draft_id"])
	db := c.App.Srv().Store().GetInternalMasterDB()
	before, appErr := selectIuinHonorAdminDraft(r.Context(), db, actor.Id, draftID)
	if appErr != nil {
		c.Err = appErr
		return
	}
	if appErr := softDeleteIuinHonorAdminDraft(r.Context(), db, actor.Id, draftID); appErr != nil {
		c.Err = appErr
		return
	}
	if appErr := removeIuinHonorAdminItemAssets(c, before.Item); appErr != nil {
		c.Logger.Warn("Failed to remove deleted IUIN honor draft assets", mlog.Err(appErr))
	}
	if appErr := insertIuinHonorAdminAudit(r.Context(), db, actor, "draft_delete", "draft", draftID, "Deleted draft "+before.Item.Name, mustMarshalIuinHonorAdminJSON(before), ""); appErr != nil {
		c.Err = appErr
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func publishIuinHonorAdminDraft(c *Context, w http.ResponseWriter, r *http.Request) {
	actor, ok := requireIuinHonorAdmin(c, false)
	if !ok {
		return
	}

	draftID := strings.TrimSpace(mux.Vars(r)["draft_id"])
	db := c.App.Srv().Store().GetInternalMasterDB()
	draft, appErr := selectIuinHonorAdminDraft(r.Context(), db, actor.Id, draftID)
	if appErr != nil {
		c.Err = appErr
		return
	}
	if appErr := validateIuinHonorAdminItem(draft.Kind, draft.Item, true); appErr != nil {
		c.Err = appErr
		return
	}
	if appErr := publishIuinHonorAdminDraftRow(r.Context(), db, actor, draft); appErr != nil {
		c.Err = appErr
		return
	}

	writeIuinHonorsJSON(c, w, draft.Item)
}

func uploadIuinHonorAdminAsset(c *Context, w http.ResponseWriter, r *http.Request) {
	actor, ok := requireIuinHonorAdmin(c, false)
	if !ok {
		return
	}
	defer discardIuinHonorAdminBody(c, r)

	r.Body = http.MaxBytesReader(w, r.Body, iuinHonorAdminAssetReadLimit)
	if err := r.ParseMultipartForm(iuinHonorAdminAssetReadLimit); err != nil {
		c.Err = model.NewAppError("uploadIuinHonorAdminAsset", "api.iuin_honors_admin.parse.app_error", nil, "", http.StatusBadRequest).Wrap(err)
		return
	}

	kind, ok := normalizeIuinHonorAdminKind(firstIuinHonorAdminFormValue(r.MultipartForm, "kind"))
	if !ok {
		c.SetInvalidParam("kind")
		return
	}
	role, ok := normalizeIuinHonorAdminAssetRole(kind, firstIuinHonorAdminFormValue(r.MultipartForm, "role"))
	if !ok {
		c.SetInvalidParam("role")
		return
	}
	itemID := strings.TrimSpace(firstIuinHonorAdminFormValue(r.MultipartForm, "item_id"))
	if !isValidIuinHonorAdminID(itemID) {
		c.SetInvalidParam("item_id")
		return
	}

	fileHeader := firstIuinHonorAdminUploadFile(r.MultipartForm)
	if fileHeader == nil {
		c.SetInvalidParam("image")
		return
	}
	file, err := fileHeader.Open()
	if err != nil {
		c.Err = model.NewAppError("uploadIuinHonorAdminAsset", "api.iuin_honors_admin.open.app_error", nil, "", http.StatusBadRequest).Wrap(err)
		return
	}
	defer file.Close()

	raw, err := io.ReadAll(file)
	if err != nil {
		c.Err = model.NewAppError("uploadIuinHonorAdminAsset", "api.iuin_honors_admin.read.app_error", nil, "", http.StatusBadRequest).Wrap(err)
		return
	}
	asset, err := processIuinHonorAdminAsset(raw, parseIuinHonorAdminFrameCrop(r.MultipartForm), parseIuinHonorAdminImageCrop(r.MultipartForm), role == "icon")
	if err != nil {
		c.Err = model.NewAppError("uploadIuinHonorAdminAsset", "api.iuin_honors_admin.process.app_error", nil, err.Error(), http.StatusBadRequest).Wrap(err)
		return
	}

	storageKey := pathpkg.Join("profile", "honors", iuinHonorAdminAssetFolder(kind), itemID, role+"-"+model.NewId()+"."+asset.Ext)
	if _, appErr := c.App.WriteFile(bytes.NewReader(asset.Content), storageKey); appErr != nil {
		c.Err = model.NewAppError("uploadIuinHonorAdminAsset", "api.iuin_honors_admin.write.app_error", nil, "", http.StatusInternalServerError).Wrap(appErr)
		return
	}

	db := c.App.Srv().Store().GetInternalMasterDB()
	if appErr := insertIuinHonorAdminAudit(r.Context(), db, actor, "upload", kind, itemID, fmt.Sprintf("Uploaded %s asset %s", role, storageKey), "", mustMarshalIuinHonorAdminJSON(iuinHonorAdminAssetResponse{
		StorageKey: storageKey,
		SHA256:     asset.SHA256,
		SizeBytes:  int64(len(asset.Content)),
		MimeType:   asset.MimeType,
	})); appErr != nil {
		c.Err = appErr
		return
	}

	writeIuinHonorsJSON(c, w, iuinHonorAdminAssetResponse{
		StorageKey: storageKey,
		SHA256:     asset.SHA256,
		SizeBytes:  int64(len(asset.Content)),
		MimeType:   asset.MimeType,
	})
}

func listIuinHonorAdminAudits(c *Context, w http.ResponseWriter, r *http.Request) {
	if _, ok := requireIuinHonorAdmin(c, true); !ok {
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 0 {
		page = 0
	}
	audits, appErr := selectIuinHonorAdminAudits(r.Context(), c.App.Srv().Store().GetInternalReplicaDB(), page, iuinHonorAdminAuditPageSize)
	if appErr != nil {
		c.Err = appErr
		return
	}

	writeIuinHonorsJSON(c, w, iuinHonorAdminAuditListResponse{Audits: audits})
}

func requireIuinHonorAdmin(c *Context, auditOnly bool) (*model.User, bool) {
	session := c.AppContext.Session()
	if session == nil || session.UserId == "" {
		c.SetPermissionError(model.PermissionManageSystem)
		return nil, false
	}

	user, appErr := c.App.GetUser(session.UserId)
	if appErr != nil {
		c.Err = appErr
		return nil, false
	}

	if !iuinHonorAdminUsers[user.Username] || (auditOnly && !iuinHonorAuditUsers[user.Username]) {
		c.SetPermissionError(model.PermissionManageSystem)
		return nil, false
	}

	return user, true
}

func normalizeIuinHonorAdminKind(value string) (string, bool) {
	switch strings.TrimSpace(value) {
	case "achievements":
		return "achievements", true
	case "titles":
		return "titles", true
	case "avatar_frames":
		return "avatar_frames", true
	default:
		return "", false
	}
}

func iuinHonorAdminDefinitionTable(kind string) (string, bool) {
	switch kind {
	case "achievements":
		return "IuinAchievements", true
	case "titles":
		return "IuinTitles", true
	case "avatar_frames":
		return "IuinAvatarFrames", true
	default:
		return "", false
	}
}

func validateIuinHonorAdminItem(kind string, item iuinHonorAdminItem, creating bool) *model.AppError {
	if !isValidIuinHonorAdminID(item.ID) {
		return model.NewAppError("validateIuinHonorAdminItem", "api.iuin_honors_admin.invalid_id.app_error", nil, "invalid item id", http.StatusBadRequest)
	}
	if strings.TrimSpace(item.Name) == "" || strings.TrimSpace(item.Description) == "" || strings.TrimSpace(item.UnlockHint) == "" {
		return model.NewAppError("validateIuinHonorAdminItem", "api.iuin_honors_admin.required.app_error", nil, "name, description, and unlock condition are required", http.StatusBadRequest)
	}
	if creating {
		switch kind {
		case "achievements":
			if item.IconStorageKey == "" {
				return model.NewAppError("validateIuinHonorAdminItem", "api.iuin_honors_admin.asset_required.app_error", nil, "achievement image is required", http.StatusBadRequest)
			}
		case "titles":
			if item.IconStorageKey == "" {
				return model.NewAppError("validateIuinHonorAdminItem", "api.iuin_honors_admin.asset_required.app_error", nil, "title image is required", http.StatusBadRequest)
			}
		case "avatar_frames":
			if item.FrameStorageKey == "" {
				return model.NewAppError("validateIuinHonorAdminItem", "api.iuin_honors_admin.asset_required.app_error", nil, "avatar frame image is required", http.StatusBadRequest)
			}
		}
	}

	for _, key := range []string{item.IconStorageKey, item.FrameStorageKey, item.PreviewStorageKey} {
		if key == "" {
			continue
		}
		if _, ok := normalizeIuinHonorAssetKey(key); !ok {
			return model.NewAppError("validateIuinHonorAdminItem", "api.iuin_honors_admin.invalid_asset.app_error", nil, "invalid asset key", http.StatusBadRequest)
		}
	}

	return nil
}

func validateIuinHonorAdminDraft(kind string, item iuinHonorAdminItem) *model.AppError {
	if item.ID != "" && !isValidIuinHonorAdminID(item.ID) {
		return model.NewAppError("validateIuinHonorAdminDraft", "api.iuin_honors_admin.invalid_id.app_error", nil, "invalid item id", http.StatusBadRequest)
	}

	for _, key := range []string{item.IconStorageKey, item.FrameStorageKey, item.PreviewStorageKey} {
		if key == "" {
			continue
		}
		if _, ok := normalizeIuinHonorAssetKey(key); !ok {
			return model.NewAppError("validateIuinHonorAdminDraft", "api.iuin_honors_admin.invalid_asset.app_error", nil, "invalid asset key", http.StatusBadRequest)
		}
	}

	return nil
}

func isValidIuinHonorAdminID(value string) bool {
	if value == "" || len(value) > 64 {
		return false
	}
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			continue
		}
		return false
	}
	return true
}

func newIuinHonorAdminItemID(kind string) string {
	switch kind {
	case "achievements":
		return "achievement_" + model.NewId()
	case "titles":
		return "title_" + model.NewId()
	default:
		return "frame_" + model.NewId()
	}
}

func selectIuinHonorAdminItems(ctx context.Context, db *sql.DB, kind string) ([]iuinHonorAdminItem, *model.AppError) {
	query := ""
	switch kind {
	case "achievements":
		query = `SELECT Id, Name, Description, IconStorageKey, Category, Rarity, UnlockHint, '', '', SortOrder, ContributorUserId, ContributorUsername FROM IuinAchievements WHERE DeleteAt = 0 ORDER BY SortOrder, Id`
	case "titles":
		query = `SELECT Id, Name, Description, IconStorageKey, '', Rarity, UnlockHint, '', '', SortOrder, ContributorUserId, ContributorUsername FROM IuinTitles WHERE DeleteAt = 0 ORDER BY SortOrder, Id`
	case "avatar_frames":
		query = `SELECT Id, Name, Description, '', '', Rarity, UnlockHint, FrameStorageKey, PreviewStorageKey, SortOrder, ContributorUserId, ContributorUsername FROM IuinAvatarFrames WHERE DeleteAt = 0 ORDER BY SortOrder, Id`
	default:
		return nil, model.NewAppError("selectIuinHonorAdminItems", "api.iuin_honors_admin.invalid_kind.app_error", nil, "", http.StatusBadRequest)
	}

	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, newIuinHonorsAppError("selectIuinHonorAdminItems", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	items := []iuinHonorAdminItem{}
	for rows.Next() {
		var item iuinHonorAdminItem
		if err := rows.Scan(&item.ID, &item.Name, &item.Description, &item.IconStorageKey, &item.Category, &item.Rarity, &item.UnlockHint, &item.FrameStorageKey, &item.PreviewStorageKey, &item.SortOrder, &item.ContributorUserID, &item.ContributorName); err != nil {
			return nil, newIuinHonorsAppError("selectIuinHonorAdminItems.scan", http.StatusInternalServerError, err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, newIuinHonorsAppError("selectIuinHonorAdminItems.rows", http.StatusInternalServerError, err)
	}

	return items, nil
}

func selectIuinHonorAdminItem(ctx context.Context, db *sql.DB, kind string, itemID string) (*iuinHonorAdminItem, *model.AppError) {
	items, appErr := selectIuinHonorAdminItems(ctx, db, kind)
	if appErr != nil {
		return nil, appErr
	}
	for _, item := range items {
		if item.ID == itemID {
			return &item, nil
		}
	}

	return nil, model.NewAppError("selectIuinHonorAdminItem", "api.iuin_honors_admin.not_found.app_error", nil, "", http.StatusNotFound)
}

func selectIuinHonorAdminItemIDs(ctx context.Context, db *sql.DB, kind string) ([]string, *model.AppError) {
	table, ok := iuinHonorAdminDefinitionTable(kind)
	if !ok {
		return nil, model.NewAppError("selectIuinHonorAdminItemIDs", "api.iuin_honors_admin.invalid_kind.app_error", nil, "", http.StatusBadRequest)
	}

	rows, err := db.QueryContext(ctx, fmt.Sprintf(`SELECT Id FROM %s WHERE DeleteAt = 0 ORDER BY SortOrder, Id`, table))
	if err != nil {
		return nil, newIuinHonorsAppError("selectIuinHonorAdminItemIDs", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, newIuinHonorsAppError("selectIuinHonorAdminItemIDs.scan", http.StatusInternalServerError, err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, newIuinHonorsAppError("selectIuinHonorAdminItemIDs.rows", http.StatusInternalServerError, err)
	}

	return ids, nil
}

func decodeIuinHonorAdminDraftRequest(r *http.Request, owner *model.User, draftID string) (iuinHonorAdminDraft, *model.AppError) {
	var request iuinHonorAdminDraftSaveRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		return iuinHonorAdminDraft{}, model.NewAppError("decodeIuinHonorAdminDraftRequest", "api.iuin_honors_admin.decode.app_error", nil, "", http.StatusBadRequest).Wrap(err)
	}

	kind, ok := normalizeIuinHonorAdminKind(request.Kind)
	if !ok {
		return iuinHonorAdminDraft{}, model.NewAppError("decodeIuinHonorAdminDraftRequest", "api.iuin_honors_admin.invalid_kind.app_error", nil, "", http.StatusBadRequest)
	}
	item := request.Item
	item.ID = strings.TrimSpace(item.ID)
	if item.ID == "" {
		item.ID = newIuinHonorAdminItemID(kind)
	}
	if item.Rarity == "" {
		item.Rarity = "common"
	}
	if appErr := validateIuinHonorAdminDraft(kind, item); appErr != nil {
		return iuinHonorAdminDraft{}, appErr
	}

	now := model.GetMillis()
	if draftID == "" {
		draftID = model.NewId()
	}
	return iuinHonorAdminDraft{
		DraftID:       draftID,
		OwnerUserID:   owner.Id,
		OwnerUsername: owner.Username,
		Kind:          kind,
		Item:          item,
		CreateAt:      now,
		UpdateAt:      now,
	}, nil
}

func selectIuinHonorAdminDrafts(ctx context.Context, db *sql.DB, ownerUserID string) ([]iuinHonorAdminDraft, *model.AppError) {
	rows, err := db.QueryContext(ctx, `
		SELECT Id, OwnerUserId, OwnerUsername, Kind, ItemId, Name, Description, IconStorageKey, Category, Rarity, UnlockHint, FrameStorageKey, PreviewStorageKey, SortOrder, CreateAt, UpdateAt
		FROM IuinHonorAdminDrafts
		WHERE OwnerUserId = $1 AND DeleteAt = 0
		ORDER BY UpdateAt DESC, Id DESC
	`, ownerUserID)
	if err != nil {
		return nil, newIuinHonorsAppError("selectIuinHonorAdminDrafts", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	drafts := []iuinHonorAdminDraft{}
	for rows.Next() {
		var draft iuinHonorAdminDraft
		if err := rows.Scan(&draft.DraftID, &draft.OwnerUserID, &draft.OwnerUsername, &draft.Kind, &draft.Item.ID, &draft.Item.Name, &draft.Item.Description, &draft.Item.IconStorageKey, &draft.Item.Category, &draft.Item.Rarity, &draft.Item.UnlockHint, &draft.Item.FrameStorageKey, &draft.Item.PreviewStorageKey, &draft.Item.SortOrder, &draft.CreateAt, &draft.UpdateAt); err != nil {
			return nil, newIuinHonorsAppError("selectIuinHonorAdminDrafts.scan", http.StatusInternalServerError, err)
		}
		drafts = append(drafts, draft)
	}
	if err := rows.Err(); err != nil {
		return nil, newIuinHonorsAppError("selectIuinHonorAdminDrafts.rows", http.StatusInternalServerError, err)
	}
	return drafts, nil
}

func selectIuinHonorAdminDraft(ctx context.Context, db *sql.DB, ownerUserID string, draftID string) (*iuinHonorAdminDraft, *model.AppError) {
	rows, appErr := selectIuinHonorAdminDrafts(ctx, db, ownerUserID)
	if appErr != nil {
		return nil, appErr
	}
	for _, draft := range rows {
		if draft.DraftID == draftID {
			return &draft, nil
		}
	}

	return nil, model.NewAppError("selectIuinHonorAdminDraft", "api.iuin_honors_admin.draft_not_found.app_error", nil, "", http.StatusNotFound)
}

func insertIuinHonorAdminDraft(ctx context.Context, db *sql.DB, draft iuinHonorAdminDraft) *model.AppError {
	if _, err := db.ExecContext(ctx, `
		INSERT INTO IuinHonorAdminDrafts
			(Id, OwnerUserId, OwnerUsername, Kind, ItemId, Name, Description, IconStorageKey, Category, Rarity, UnlockHint, FrameStorageKey, PreviewStorageKey, SortOrder, CreateAt, UpdateAt, DeleteAt)
		VALUES
			($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15, 0)
	`, draft.DraftID, draft.OwnerUserID, draft.OwnerUsername, draft.Kind, draft.Item.ID, strings.TrimSpace(draft.Item.Name), strings.TrimSpace(draft.Item.Description), draft.Item.IconStorageKey, draft.Item.Category, draft.Item.Rarity, strings.TrimSpace(draft.Item.UnlockHint), draft.Item.FrameStorageKey, draft.Item.PreviewStorageKey, draft.Item.SortOrder, draft.CreateAt); err != nil {
		return newIuinHonorsAppError("insertIuinHonorAdminDraft", http.StatusInternalServerError, err)
	}
	return nil
}

func updateIuinHonorAdminDraftRow(ctx context.Context, db *sql.DB, draft iuinHonorAdminDraft) *model.AppError {
	now := model.GetMillis()
	result, err := db.ExecContext(ctx, `
		UPDATE IuinHonorAdminDrafts
		SET Kind = $3, ItemId = $4, Name = $5, Description = $6, IconStorageKey = $7, Category = $8, Rarity = $9, UnlockHint = $10, FrameStorageKey = $11, PreviewStorageKey = $12, SortOrder = $13, UpdateAt = $14
		WHERE Id = $1 AND OwnerUserId = $2 AND DeleteAt = 0
	`, draft.DraftID, draft.OwnerUserID, draft.Kind, draft.Item.ID, strings.TrimSpace(draft.Item.Name), strings.TrimSpace(draft.Item.Description), draft.Item.IconStorageKey, draft.Item.Category, draft.Item.Rarity, strings.TrimSpace(draft.Item.UnlockHint), draft.Item.FrameStorageKey, draft.Item.PreviewStorageKey, draft.Item.SortOrder, now)
	if err != nil {
		return newIuinHonorsAppError("updateIuinHonorAdminDraftRow", http.StatusInternalServerError, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return newIuinHonorsAppError("updateIuinHonorAdminDraftRow.rows", http.StatusInternalServerError, err)
	}
	if rows == 0 {
		return model.NewAppError("updateIuinHonorAdminDraftRow", "api.iuin_honors_admin.draft_not_found.app_error", nil, "", http.StatusNotFound)
	}
	return nil
}

func softDeleteIuinHonorAdminDraft(ctx context.Context, exec iuinHonorAdminExecutor, ownerUserID string, draftID string) *model.AppError {
	now := model.GetMillis()
	result, err := exec.ExecContext(ctx, `
		UPDATE IuinHonorAdminDrafts
		SET DeleteAt = $3, UpdateAt = $3
		WHERE Id = $1 AND OwnerUserId = $2 AND DeleteAt = 0
	`, draftID, ownerUserID, now)
	if err != nil {
		return newIuinHonorsAppError("softDeleteIuinHonorAdminDraft", http.StatusInternalServerError, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return newIuinHonorsAppError("softDeleteIuinHonorAdminDraft.rows", http.StatusInternalServerError, err)
	}
	if rows == 0 {
		return model.NewAppError("softDeleteIuinHonorAdminDraft", "api.iuin_honors_admin.draft_not_found.app_error", nil, "", http.StatusNotFound)
	}
	return nil
}

func publishIuinHonorAdminDraftRow(ctx context.Context, db *sql.DB, actor *model.User, draft *iuinHonorAdminDraft) *model.AppError {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return newIuinHonorsAppError("publishIuinHonorAdminDraftRow.begin", http.StatusInternalServerError, err)
	}
	defer tx.Rollback()

	if appErr := ensureIuinHonorAdminIDAvailable(ctx, tx, draft.Kind, draft.Item.ID); appErr != nil {
		return appErr
	}
	if appErr := insertIuinHonorAdminItem(ctx, tx, draft.Kind, draft.Item, actor); appErr != nil {
		return appErr
	}
	if appErr := softDeleteIuinHonorAdminDraft(ctx, tx, actor.Id, draft.DraftID); appErr != nil {
		return appErr
	}
	if appErr := insertIuinHonorAdminAudit(ctx, tx, actor, "publish", draft.Kind, draft.Item.ID, "Published "+draft.Item.Name, mustMarshalIuinHonorAdminJSON(draft), mustMarshalIuinHonorAdminJSON(draft.Item)); appErr != nil {
		return appErr
	}
	if err := tx.Commit(); err != nil {
		return newIuinHonorsAppError("publishIuinHonorAdminDraftRow.commit", http.StatusInternalServerError, err)
	}
	return nil
}

func reorderIuinHonorAdminItemRows(ctx context.Context, db *sql.DB, actor *model.User, kind string, before []string, after []string) *model.AppError {
	if !sameIuinHonorAdminIDs(before, after) {
		return model.NewAppError("reorderIuinHonorAdminItemRows", "api.iuin_honors_admin.reorder_conflict.app_error", nil, "resource list changed; refresh and try again", http.StatusConflict)
	}
	table, ok := iuinHonorAdminDefinitionTable(kind)
	if !ok {
		return model.NewAppError("reorderIuinHonorAdminItemRows", "api.iuin_honors_admin.invalid_kind.app_error", nil, "", http.StatusBadRequest)
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return newIuinHonorsAppError("reorderIuinHonorAdminItemRows.begin", http.StatusInternalServerError, err)
	}
	defer tx.Rollback()

	now := model.GetMillis()
	for index, itemID := range after {
		if _, err := tx.ExecContext(ctx, fmt.Sprintf(`UPDATE %s SET SortOrder = $2, UpdateAt = $3 WHERE Id = $1 AND DeleteAt = 0`, table), itemID, (index+1)*10, now); err != nil {
			return newIuinHonorsAppError("reorderIuinHonorAdminItemRows.update", http.StatusInternalServerError, err)
		}
	}

	beforePayload := mustMarshalIuinHonorAdminJSON(map[string][]string{"order": before})
	afterPayload := mustMarshalIuinHonorAdminJSON(map[string][]string{"order": after})
	if appErr := insertIuinHonorAdminAudit(ctx, tx, actor, "reorder", kind, "", fmt.Sprintf("Reordered %d %s resources", len(after), kind), beforePayload, afterPayload); appErr != nil {
		return appErr
	}
	if err := tx.Commit(); err != nil {
		return newIuinHonorsAppError("reorderIuinHonorAdminItemRows.commit", http.StatusInternalServerError, err)
	}

	return nil
}

func sameIuinHonorAdminIDs(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	counts := map[string]int{}
	for _, id := range left {
		counts[id]++
	}
	for _, id := range right {
		counts[id]--
		if counts[id] < 0 {
			return false
		}
	}
	return true
}

func insertIuinHonorAdminItem(ctx context.Context, exec iuinHonorAdminExecutor, kind string, item iuinHonorAdminItem, contributor *model.User) *model.AppError {
	now := model.GetMillis()
	contributorID := ""
	contributorUsername := ""
	if contributor != nil {
		contributorID = contributor.Id
		contributorUsername = contributor.Username
	}
	var err error
	switch kind {
	case "achievements":
		_, err = exec.ExecContext(ctx, `
			INSERT INTO IuinAchievements
				(Id, Name, Description, IconStorageKey, Category, Rarity, UnlockHint, SortOrder, ContributorUserId, ContributorUsername, CreateAt, UpdateAt, DeleteAt)
			VALUES
				($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, 0)
		`, item.ID, strings.TrimSpace(item.Name), strings.TrimSpace(item.Description), item.IconStorageKey, item.Category, item.Rarity, strings.TrimSpace(item.UnlockHint), item.SortOrder, contributorID, contributorUsername, now)
	case "titles":
		_, err = exec.ExecContext(ctx, `
			INSERT INTO IuinTitles
				(Id, Name, Description, IconStorageKey, Rarity, UnlockHint, SortOrder, ContributorUserId, ContributorUsername, CreateAt, UpdateAt, DeleteAt)
			VALUES
				($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, 0)
		`, item.ID, strings.TrimSpace(item.Name), strings.TrimSpace(item.Description), item.IconStorageKey, item.Rarity, strings.TrimSpace(item.UnlockHint), item.SortOrder, contributorID, contributorUsername, now)
	case "avatar_frames":
		_, err = exec.ExecContext(ctx, `
			INSERT INTO IuinAvatarFrames
				(Id, Name, Description, FrameStorageKey, PreviewStorageKey, Rarity, UnlockHint, SortOrder, ContributorUserId, ContributorUsername, CreateAt, UpdateAt, DeleteAt)
			VALUES
				($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, 0)
		`, item.ID, strings.TrimSpace(item.Name), strings.TrimSpace(item.Description), item.FrameStorageKey, item.PreviewStorageKey, item.Rarity, strings.TrimSpace(item.UnlockHint), item.SortOrder, contributorID, contributorUsername, now)
	}
	if err != nil {
		return newIuinHonorsAppError("insertIuinHonorAdminItem", http.StatusInternalServerError, err)
	}

	return nil
}

func updateIuinHonorAdminItemRow(ctx context.Context, db *sql.DB, kind string, previousID string, item iuinHonorAdminItem) *model.AppError {
	now := model.GetMillis()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return newIuinHonorsAppError("updateIuinHonorAdminItemRow.begin", http.StatusInternalServerError, err)
	}
	defer tx.Rollback()

	if previousID != item.ID {
		if appErr := ensureIuinHonorAdminIDAvailable(ctx, tx, kind, item.ID); appErr != nil {
			return appErr
		}
	}

	var result sql.Result
	switch kind {
	case "achievements":
		result, err = tx.ExecContext(ctx, `
			UPDATE IuinAchievements
			SET Id = $2, Name = $3, Description = $4, IconStorageKey = $5, Category = $6, Rarity = $7, UnlockHint = $8, SortOrder = $9, UpdateAt = $10, DeleteAt = 0
			WHERE Id = $1
		`, previousID, item.ID, strings.TrimSpace(item.Name), strings.TrimSpace(item.Description), item.IconStorageKey, item.Category, item.Rarity, strings.TrimSpace(item.UnlockHint), item.SortOrder, now)
		if err == nil && previousID != item.ID {
			err = updateIuinHonorAdminReferences(ctx, tx, "IuinUserAchievements", "AchievementId", previousID, item.ID)
		}
		if err == nil && previousID != item.ID {
			err = updateIuinHonorAdminReferences(ctx, tx, "IuinFeaturedAchievements", "AchievementId", previousID, item.ID)
		}
	case "titles":
		result, err = tx.ExecContext(ctx, `
			UPDATE IuinTitles
			SET Id = $2, Name = $3, Description = $4, IconStorageKey = $5, Rarity = $6, UnlockHint = $7, SortOrder = $8, UpdateAt = $9, DeleteAt = 0
			WHERE Id = $1
		`, previousID, item.ID, strings.TrimSpace(item.Name), strings.TrimSpace(item.Description), item.IconStorageKey, item.Rarity, strings.TrimSpace(item.UnlockHint), item.SortOrder, now)
		if err == nil && previousID != item.ID {
			err = updateIuinHonorAdminReferences(ctx, tx, "IuinUserTitles", "TitleId", previousID, item.ID)
		}
		if err == nil && previousID != item.ID {
			err = updateIuinHonorAdminReferences(ctx, tx, "IuinUserTitleLoadouts", "TitleId", previousID, item.ID)
		}
	case "avatar_frames":
		result, err = tx.ExecContext(ctx, `
			UPDATE IuinAvatarFrames
			SET Id = $2, Name = $3, Description = $4, FrameStorageKey = $5, PreviewStorageKey = $6, Rarity = $7, UnlockHint = $8, SortOrder = $9, UpdateAt = $10, DeleteAt = 0
			WHERE Id = $1
		`, previousID, item.ID, strings.TrimSpace(item.Name), strings.TrimSpace(item.Description), item.FrameStorageKey, item.PreviewStorageKey, item.Rarity, strings.TrimSpace(item.UnlockHint), item.SortOrder, now)
		if err == nil && previousID != item.ID {
			err = updateIuinHonorAdminReferences(ctx, tx, "IuinUserAvatarFrames", "AvatarFrameId", previousID, item.ID)
		}
		if err == nil && previousID != item.ID {
			err = updateIuinHonorAdminReferences(ctx, tx, "IuinUserAvatarFrameLoadouts", "AvatarFrameId", previousID, item.ID)
		}
	}
	if err != nil {
		return newIuinHonorsAppError("updateIuinHonorAdminItemRow", http.StatusInternalServerError, err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return newIuinHonorsAppError("updateIuinHonorAdminItemRow.rows", http.StatusInternalServerError, err)
	}
	if rows == 0 {
		return model.NewAppError("updateIuinHonorAdminItemRow", "api.iuin_honors_admin.not_found.app_error", nil, "", http.StatusNotFound)
	}
	if err := tx.Commit(); err != nil {
		return newIuinHonorsAppError("updateIuinHonorAdminItemRow.commit", http.StatusInternalServerError, err)
	}

	return nil
}

func ensureIuinHonorAdminIDAvailable(ctx context.Context, tx *sql.Tx, kind string, itemID string) *model.AppError {
	query := ""
	switch kind {
	case "achievements":
		query = `SELECT 1 FROM IuinAchievements WHERE Id = $1`
	case "titles":
		query = `SELECT 1 FROM IuinTitles WHERE Id = $1`
	case "avatar_frames":
		query = `SELECT 1 FROM IuinAvatarFrames WHERE Id = $1`
	default:
		return model.NewAppError("ensureIuinHonorAdminIDAvailable", "api.iuin_honors_admin.invalid_kind.app_error", nil, "", http.StatusBadRequest)
	}

	var exists int
	if err := tx.QueryRowContext(ctx, query, itemID).Scan(&exists); err != nil {
		if err == sql.ErrNoRows {
			return nil
		}
		return newIuinHonorsAppError("ensureIuinHonorAdminIDAvailable", http.StatusInternalServerError, err)
	}

	return model.NewAppError("ensureIuinHonorAdminIDAvailable", "api.iuin_honors_admin.id_exists.app_error", nil, "ID already exists", http.StatusConflict)
}

func updateIuinHonorAdminReferences(ctx context.Context, tx *sql.Tx, table string, column string, previousID string, nextID string) error {
	_, err := tx.ExecContext(ctx, fmt.Sprintf(`UPDATE %s SET %s = $2 WHERE %s = $1`, table, column, column), previousID, nextID)
	return err
}

func hardDeleteIuinHonorAdminItem(ctx context.Context, db *sql.DB, kind string, itemID string) *model.AppError {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return newIuinHonorsAppError("hardDeleteIuinHonorAdminItem.begin", http.StatusInternalServerError, err)
	}
	defer tx.Rollback()

	switch kind {
	case "achievements":
		if _, err := tx.ExecContext(ctx, `DELETE FROM IuinFeaturedAchievements WHERE AchievementId = $1`, itemID); err != nil {
			return newIuinHonorsAppError("hardDeleteIuinHonorAdminItem.featured", http.StatusInternalServerError, err)
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM IuinUserAchievements WHERE AchievementId = $1`, itemID); err != nil {
			return newIuinHonorsAppError("hardDeleteIuinHonorAdminItem.userAchievements", http.StatusInternalServerError, err)
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM IuinAchievements WHERE Id = $1`, itemID); err != nil {
			return newIuinHonorsAppError("hardDeleteIuinHonorAdminItem.achievement", http.StatusInternalServerError, err)
		}
	case "titles":
		if _, err := tx.ExecContext(ctx, `DELETE FROM IuinUserTitleLoadouts WHERE TitleId = $1`, itemID); err != nil {
			return newIuinHonorsAppError("hardDeleteIuinHonorAdminItem.titleLoadouts", http.StatusInternalServerError, err)
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM IuinUserTitles WHERE TitleId = $1`, itemID); err != nil {
			return newIuinHonorsAppError("hardDeleteIuinHonorAdminItem.userTitles", http.StatusInternalServerError, err)
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM IuinTitles WHERE Id = $1`, itemID); err != nil {
			return newIuinHonorsAppError("hardDeleteIuinHonorAdminItem.title", http.StatusInternalServerError, err)
		}
	case "avatar_frames":
		if _, err := tx.ExecContext(ctx, `DELETE FROM IuinUserAvatarFrameLoadouts WHERE AvatarFrameId = $1`, itemID); err != nil {
			return newIuinHonorsAppError("hardDeleteIuinHonorAdminItem.frameLoadouts", http.StatusInternalServerError, err)
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM IuinUserAvatarFrames WHERE AvatarFrameId = $1`, itemID); err != nil {
			return newIuinHonorsAppError("hardDeleteIuinHonorAdminItem.userFrames", http.StatusInternalServerError, err)
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM IuinAvatarFrames WHERE Id = $1`, itemID); err != nil {
			return newIuinHonorsAppError("hardDeleteIuinHonorAdminItem.frame", http.StatusInternalServerError, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return newIuinHonorsAppError("hardDeleteIuinHonorAdminItem.commit", http.StatusInternalServerError, err)
	}
	return nil
}

func insertIuinHonorAdminAudit(ctx context.Context, exec iuinHonorAdminExecutor, actor *model.User, action string, targetType string, targetID string, summary string, before string, after string) *model.AppError {
	now := model.GetMillis()
	if _, err := exec.ExecContext(ctx, `
		INSERT INTO IuinHonorAdminAudits
			(Id, ActorUserId, ActorUsername, Action, TargetType, TargetId, Summary, BeforePayload, AfterPayload, CreateAt)
		VALUES
			($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, model.NewId(), actor.Id, actor.Username, action, targetType, targetID, summary, before, after, now); err != nil {
		return newIuinHonorsAppError("insertIuinHonorAdminAudit", http.StatusInternalServerError, err)
	}
	return nil
}

func selectIuinHonorAdminAudits(ctx context.Context, db *sql.DB, page int, perPage int) ([]iuinHonorAdminAuditItem, *model.AppError) {
	rows, err := db.QueryContext(ctx, `
		SELECT Id, ActorUserId, ActorUsername, Action, TargetType, TargetId, Summary, BeforePayload, AfterPayload, CreateAt
		FROM IuinHonorAdminAudits
		ORDER BY CreateAt DESC, Id DESC
		LIMIT $1 OFFSET $2
	`, perPage, page*perPage)
	if err != nil {
		return nil, newIuinHonorsAppError("selectIuinHonorAdminAudits", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	audits := []iuinHonorAdminAuditItem{}
	for rows.Next() {
		var audit iuinHonorAdminAuditItem
		if err := rows.Scan(&audit.ID, &audit.ActorUserID, &audit.ActorUsername, &audit.Action, &audit.TargetType, &audit.TargetID, &audit.Summary, &audit.BeforePayload, &audit.AfterPayload, &audit.CreateAt); err != nil {
			return nil, newIuinHonorsAppError("selectIuinHonorAdminAudits.scan", http.StatusInternalServerError, err)
		}
		audits = append(audits, audit)
	}
	if err := rows.Err(); err != nil {
		return nil, newIuinHonorsAppError("selectIuinHonorAdminAudits.rows", http.StatusInternalServerError, err)
	}
	return audits, nil
}

func normalizeIuinHonorAdminAssetRole(kind string, value string) (string, bool) {
	role := strings.TrimSpace(value)
	switch kind {
	case "achievements":
		if role == "icon" {
			return role, true
		}
	case "titles":
		if role == "title" {
			return role, true
		}
	case "avatar_frames":
		if role == "frame" || role == "preview" {
			return role, true
		}
	}
	return "", false
}

func iuinHonorAdminAssetFolder(kind string) string {
	switch kind {
	case "achievements":
		return "achievements"
	case "titles":
		return "titles"
	default:
		return "avatar_frames"
	}
}

func firstIuinHonorAdminUploadFile(form *multipart.Form) *multipart.FileHeader {
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

func firstIuinHonorAdminFormValue(form *multipart.Form, key string) string {
	if form == nil || form.Value == nil {
		return ""
	}
	values := form.Value[key]
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func processIuinHonorAdminAsset(raw []byte, frameCrop iuinHonorAdminFrameCrop, imageCrop iuinHonorAdminImageCrop, circularImageCrop bool) (iuinHonorAdminAssetData, error) {
	if len(raw) == 0 {
		return iuinHonorAdminAssetData{}, fmt.Errorf("empty image")
	}
	if len(raw) > iuinHonorAdminAssetMaxBytes {
		return iuinHonorAdminAssetData{}, fmt.Errorf("image must be under %d bytes", iuinHonorAdminAssetMaxBytes)
	}

	mimeType := http.DetectContentType(raw)
	ext := ""
	switch mimeType {
	case "image/png":
		ext = "png"
	case "image/jpeg":
		ext = "jpg"
	case "image/gif":
		ext = "gif"
	case "image/webp":
		ext = "webp"
	default:
		return iuinHonorAdminAssetData{}, fmt.Errorf("upload a PNG, JPG, GIF, or WebP image")
	}

	content := raw
	if imageCrop.Enabled {
		if mimeType == "image/gif" {
			cropped, err := cropIuinHonorAdminGIFToCanvas(raw, imageCrop.OutputWidth, imageCrop.OutputHeight, imageCrop.X, imageCrop.Y, imageCrop.Width, imageCrop.Height, circularImageCrop)
			if err != nil {
				return iuinHonorAdminAssetData{}, err
			}
			content = cropped
		} else {
			cropped, err := cropIuinHonorAdminStaticImage(raw, imageCrop, circularImageCrop)
			if err != nil {
				return iuinHonorAdminAssetData{}, err
			}
			content = cropped
			mimeType = "image/png"
			ext = "png"
		}
	} else if frameCrop.Enabled && mimeType == "image/gif" {
		cropped, err := cropIuinHonorAdminGIFToCanvas(raw, frameCrop.OutputSize, frameCrop.OutputSize, frameCrop.X, frameCrop.Y, frameCrop.Width, frameCrop.Height, false)
		if err != nil {
			return iuinHonorAdminAssetData{}, err
		}
		content = cropped
	}

	hash := sha256.Sum256(content)
	return iuinHonorAdminAssetData{
		Content:  content,
		MimeType: mimeType,
		Ext:      ext,
		SHA256:   hex.EncodeToString(hash[:]),
	}, nil
}

func parseIuinHonorAdminFrameCrop(form *multipart.Form) iuinHonorAdminFrameCrop {
	size := parseIuinHonorAdminFloat(form, "output_size", iuinHonorFrameCanvasSize)
	width := parseIuinHonorAdminFloat(form, "frame_width", 0)
	height := parseIuinHonorAdminFloat(form, "frame_height", 0)
	if size < 64 || size > 2048 || width <= 0 || height <= 0 {
		return iuinHonorAdminFrameCrop{}
	}

	return iuinHonorAdminFrameCrop{
		Enabled:    true,
		OutputSize: int(size),
		X:          parseIuinHonorAdminFloat(form, "frame_x", 0),
		Y:          parseIuinHonorAdminFloat(form, "frame_y", 0),
		Width:      width,
		Height:     height,
	}
}

func parseIuinHonorAdminImageCrop(form *multipart.Form) iuinHonorAdminImageCrop {
	width := parseIuinHonorAdminFloat(form, "output_width", iuinHonorImageCanvasWidth)
	height := parseIuinHonorAdminFloat(form, "output_height", iuinHonorImageCanvasHeight)
	imageWidth := parseIuinHonorAdminFloat(form, "image_width", 0)
	imageHeight := parseIuinHonorAdminFloat(form, "image_height", 0)
	if width < 64 || width > 2048 || height < 64 || height > 2048 || imageWidth <= 0 || imageHeight <= 0 {
		return iuinHonorAdminImageCrop{}
	}

	return iuinHonorAdminImageCrop{
		Enabled:      true,
		OutputWidth:  int(width),
		OutputHeight: int(height),
		X:            parseIuinHonorAdminFloat(form, "image_x", 0),
		Y:            parseIuinHonorAdminFloat(form, "image_y", 0),
		Width:        imageWidth,
		Height:       imageHeight,
	}
}

func parseIuinHonorAdminFloat(form *multipart.Form, key string, fallback float64) float64 {
	value, err := strconv.ParseFloat(firstIuinHonorAdminFormValue(form, key), 64)
	if err != nil {
		return fallback
	}
	return value
}

func cropIuinHonorAdminStaticImage(raw []byte, crop iuinHonorAdminImageCrop, circularMask bool) ([]byte, error) {
	source, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("could not decode image")
	}

	dstBounds := image.Rect(0, 0, crop.OutputWidth, crop.OutputHeight)
	dstRect := image.Rect(
		int(crop.X),
		int(crop.Y),
		int(crop.X+crop.Width),
		int(crop.Y+crop.Height),
	)
	rgba := image.NewNRGBA(dstBounds)
	xdraw.CatmullRom.Scale(rgba, dstRect, source, source.Bounds(), stddraw.Over, nil)
	if circularMask {
		applyIuinHonorAdminCircleMask(rgba)
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, rgba); err != nil {
		return nil, fmt.Errorf("could not encode cropped image")
	}
	return buf.Bytes(), nil
}

func cropIuinHonorAdminGIFToCanvas(raw []byte, outputWidth int, outputHeight int, x float64, y float64, width float64, height float64, circularMask bool) ([]byte, error) {
	source, err := gif.DecodeAll(bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("could not decode GIF")
	}
	if len(source.Image) == 0 {
		return nil, fmt.Errorf("GIF has no frames")
	}

	output := &gif.GIF{
		Image:           make([]*image.Paletted, 0, len(source.Image)),
		Delay:           append([]int(nil), source.Delay...),
		Disposal:        append([]byte(nil), source.Disposal...),
		LoopCount:       source.LoopCount,
		BackgroundIndex: 0,
	}
	dstBounds := image.Rect(0, 0, outputWidth, outputHeight)
	dstRect := image.Rect(
		int(x),
		int(y),
		int(x+width),
		int(y+height),
	)
	pal := make(color.Palette, 0, 257)
	pal = append(pal, color.NRGBA{R: 0, G: 0, B: 0, A: 0})
	pal = append(pal, source.Image[0].Palette...)
	if len(pal) > 256 {
		pal = pal[:256]
	}

	for _, frame := range source.Image {
		rgba := image.NewNRGBA(dstBounds)
		xdraw.CatmullRom.Scale(rgba, dstRect, frame, frame.Bounds(), stddraw.Over, nil)
		if circularMask {
			applyIuinHonorAdminCircleMask(rgba)
		}
		paletted := image.NewPaletted(dstBounds, pal)
		stddraw.FloydSteinberg.Draw(paletted, dstBounds, rgba, image.Point{})
		output.Image = append(output.Image, paletted)
	}
	if len(output.Delay) != len(output.Image) {
		output.Delay = make([]int, len(output.Image))
		for i := range output.Delay {
			output.Delay[i] = 8
		}
	}
	if len(output.Disposal) != len(output.Image) {
		output.Disposal = make([]byte, len(output.Image))
		for i := range output.Disposal {
			output.Disposal[i] = gif.DisposalBackground
		}
	}
	output.Config = image.Config{
		ColorModel: pal,
		Width:      outputWidth,
		Height:     outputHeight,
	}

	var buf bytes.Buffer
	if err := gif.EncodeAll(&buf, output); err != nil {
		return nil, fmt.Errorf("could not encode cropped GIF")
	}
	return buf.Bytes(), nil
}

func applyIuinHonorAdminCircleMask(rgba *image.NRGBA) {
	bounds := rgba.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= 0 || height <= 0 {
		return
	}

	radius := math.Min(float64(width), float64(height)) / 2
	centerX := float64(bounds.Min.X) + float64(width)/2
	centerY := float64(bounds.Min.Y) + float64(height)/2

	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			dx := float64(x) + 0.5 - centerX
			dy := float64(y) + 0.5 - centerY
			distance := math.Sqrt(dx*dx + dy*dy)
			if distance <= radius-1 {
				continue
			}

			offset := rgba.PixOffset(x, y)
			if distance >= radius {
				rgba.Pix[offset+3] = 0
				continue
			}

			rgba.Pix[offset+3] = uint8(float64(rgba.Pix[offset+3]) * (radius - distance))
		}
	}
}

func removeIuinHonorAdminReplacedAssets(c *Context, before *iuinHonorAdminItem, after iuinHonorAdminItem) *model.AppError {
	if before == nil {
		return nil
	}
	oldKeys := []string{}
	if before.IconStorageKey != "" && before.IconStorageKey != after.IconStorageKey {
		oldKeys = append(oldKeys, before.IconStorageKey)
	}
	if before.FrameStorageKey != "" && before.FrameStorageKey != after.FrameStorageKey {
		oldKeys = append(oldKeys, before.FrameStorageKey)
	}
	if before.PreviewStorageKey != "" && before.PreviewStorageKey != after.PreviewStorageKey {
		oldKeys = append(oldKeys, before.PreviewStorageKey)
	}
	return removeIuinHonorAdminAssetKeys(c, oldKeys)
}

func removeIuinHonorAdminItemAssets(c *Context, item iuinHonorAdminItem) *model.AppError {
	return removeIuinHonorAdminAssetKeys(c, []string{item.IconStorageKey, item.FrameStorageKey, item.PreviewStorageKey})
}

func removeIuinHonorAdminAssetKeys(c *Context, keys []string) *model.AppError {
	seen := map[string]bool{}
	for _, key := range keys {
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		if appErr := c.App.RemoveFile(key); appErr != nil {
			return appErr
		}
	}
	return nil
}

func describeIuinHonorAdminChange(kind string, before iuinHonorAdminItem, after iuinHonorAdminItem) string {
	changed := []string{}
	if before.ID != after.ID {
		changed = append(changed, "id")
	}
	if before.Name != after.Name {
		changed = append(changed, "name")
	}
	if before.Description != after.Description {
		changed = append(changed, "description")
	}
	if before.UnlockHint != after.UnlockHint {
		changed = append(changed, "unlock condition")
	}
	if before.IconStorageKey != after.IconStorageKey || before.FrameStorageKey != after.FrameStorageKey || before.PreviewStorageKey != after.PreviewStorageKey {
		changed = append(changed, "asset")
	}
	if before.Category != after.Category || before.Rarity != after.Rarity || before.SortOrder != after.SortOrder {
		changed = append(changed, "metadata")
	}
	if len(changed) == 0 {
		return "Saved without field changes"
	}
	return "Updated " + strings.Join(changed, ", ")
}

func mustMarshalIuinHonorAdminJSON(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(data)
}

func discardIuinHonorAdminBody(c *Context, r *http.Request) {
	if _, err := io.Copy(io.Discard, r.Body); err != nil {
		c.Logger.Warn("Error while discarding IUIN honor admin request body", mlog.Err(err))
	}
}

func init() {
	image.RegisterFormat("jpeg", "\xff\xd8", jpeg.Decode, jpeg.DecodeConfig)
	image.RegisterFormat("png", "\x89PNG\r\n\x1a\n", png.Decode, png.DecodeConfig)
}
