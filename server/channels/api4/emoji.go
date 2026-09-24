// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
	"github.com/mattermost/mattermost/server/v8/channels/app"
	"github.com/mattermost/mattermost/server/v8/channels/web"
)

const (
	EmojiMaxAutocompleteItems = 100
	GetEmojisByNamesMax       = 200
)

func (api *API) InitEmoji() {
	api.BaseRoutes.Emojis.Handle("", api.APISessionRequired(createEmoji, handlerParamFileAPI)).Methods(http.MethodPost)
	api.BaseRoutes.Emojis.Handle("", api.APISessionRequired(getEmojiList)).Methods(http.MethodGet)
	api.BaseRoutes.Emojis.Handle("/names", api.APISessionRequired(getEmojisByNames)).Methods(http.MethodPost)
	api.BaseRoutes.Emojis.Handle("/search", api.APISessionRequired(searchEmojis)).Methods(http.MethodPost)
	api.BaseRoutes.Emojis.Handle("/autocomplete", api.APISessionRequired(autocompleteEmojis)).Methods(http.MethodGet)
	api.BaseRoutes.Emoji.Handle("", api.APISessionRequired(deleteEmoji)).Methods(http.MethodDelete)
	api.BaseRoutes.Emoji.Handle("", api.APISessionRequired(getEmoji)).Methods(http.MethodGet)
	api.BaseRoutes.EmojiByName.Handle("", api.APISessionRequired(getEmojiByName)).Methods(http.MethodGet)
	api.BaseRoutes.Emoji.Handle("/image", api.APISessionRequiredTrustRequester(getEmojiImage)).Methods(http.MethodGet)
}

func createEmoji(c *Context, w http.ResponseWriter, r *http.Request) {
	defer func() {
		if _, err := io.Copy(io.Discard, r.Body); err != nil {
			c.Logger.Warn("Error while discarding request body", mlog.Err(err))
		}
	}()

	if !*c.App.Config().ServiceSettings.EnableCustomEmoji {
		c.Err = model.NewAppError("createEmoji", "api.emoji.disabled.app_error", nil, "", http.StatusNotImplemented)
		return
	}

	if r.ContentLength > app.MaxEmojiFileSize {
		c.Err = model.NewAppError("createEmoji", "api.emoji.create.too_large.app_error", nil, "", http.StatusRequestEntityTooLarge)
		return
	}

	auditRec := c.MakeAuditRecord(model.AuditEventCreateEmoji, model.AuditStatusFail)
	defer c.LogAuditRec(auditRec)

	// Preserve the core API CREATE_EMOJIS permission contract even though the
	// accepted image is stored in the private, deduplicated IUIN emoji library.
	memberships, err := c.App.GetTeamMembersForUser(c.AppContext, c.AppContext.Session().UserId, "", true)
	if err != nil {
		c.Err = err
		return
	}

	if !c.App.SessionHasPermissionTo(*c.AppContext.Session(), model.PermissionCreateEmojis) {
		hasPermission := false
		for _, membership := range memberships {
			if c.App.SessionHasPermissionToTeam(*c.AppContext.Session(), membership.TeamId, model.PermissionCreateEmojis) {
				hasPermission = true
				break
			}
		}
		if !hasPermission {
			c.SetPermissionError(model.PermissionCreateEmojis)
			return
		}
	}

	// Retain the v11.8.3 512 KiB request ceiling for the compatibility endpoint.
	// The IUIN-specific endpoint applies its own independently configured limit.
	r.Body = http.MaxBytesReader(w, r.Body, app.MaxEmojiFileSize)
	uploadIuinEmoji(c, w, r)
	if c.Err != nil {
		return
	}

	auditRec.Success()
}

func getEmojiList(c *Context, w http.ResponseWriter, r *http.Request) {
	if !*c.App.Config().ServiceSettings.EnableCustomEmoji {
		c.Err = model.NewAppError("getEmoji", "api.emoji.disabled.app_error", nil, "", http.StatusNotImplemented)
		return
	}

	sort := r.URL.Query().Get("sort")
	if sort != "" && sort != model.EmojiSortByName {
		c.SetInvalidURLParam("sort")
		return
	}

	listEmoji, err := c.App.GetEmojiList(c.AppContext, c.Params.Page, c.Params.PerPage, sort)
	if err != nil {
		c.Err = err
		return
	}
	listEmoji = filterIuinEmojisForUser(r.Context(), c.App.Srv().Store().GetInternalReplicaDB(), c.AppContext.Session().UserId, listEmoji)

	if err := json.NewEncoder(w).Encode(listEmoji); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func deleteEmoji(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireEmojiId()
	if c.Err != nil {
		return
	}

	auditRec := c.MakeAuditRecord(model.AuditEventDeleteEmoji, model.AuditStatusFail)
	defer c.LogAuditRec(auditRec)

	emoji, err := c.App.GetEmoji(c.AppContext, c.Params.EmojiId)
	if err != nil {
		model.AddEventParameterToAuditRec(auditRec, "emoji_id", c.Params.EmojiId)
		c.Err = err
		return
	}
	auditRec.AddEventPriorState(emoji)
	auditRec.AddEventObjectType("emoji")

	var isUnified bool
	if db := c.App.Srv().Store().GetInternalMasterDB(); db != nil {
		if queryErr := db.QueryRowContext(r.Context(), `SELECT EXISTS (SELECT 1 FROM IuinEmojiAssets WHERE EmojiId = $1 AND DeleteAt = 0)`, emoji.Id).Scan(&isUnified); queryErr == nil && isUnified {
			now := model.GetMillis()
			if _, queryErr = db.ExecContext(r.Context(), `
				UPDATE IuinUserEmojis
				   SET DeleteAt = $3, UpdateAt = $3
				 WHERE UserId = $1 AND EmojiId = $2 AND DeleteAt = 0`, c.AppContext.Session().UserId, emoji.Id, now); queryErr != nil {
				c.Err = model.NewAppError("deleteEmoji", "api.iuin_emojis.storage_error", nil, "", http.StatusInternalServerError).Wrap(queryErr)
				return
			}
			auditRec.Success()
			ReturnStatusOK(w)
			return
		}
	}

	// Allow any user with DELETE_EMOJIS permission at Team level to delete emojis at system level
	memberships, err := c.App.GetTeamMembersForUser(c.AppContext, c.AppContext.Session().UserId, "", true)

	if err != nil {
		c.Err = err
		return
	}

	if !c.App.SessionHasPermissionTo(*c.AppContext.Session(), model.PermissionDeleteEmojis) {
		hasPermission := false
		for _, membership := range memberships {
			if c.App.SessionHasPermissionToTeam(*c.AppContext.Session(), membership.TeamId, model.PermissionDeleteEmojis) {
				hasPermission = true
				break
			}
		}
		if !hasPermission {
			c.SetPermissionError(model.PermissionDeleteEmojis)
			return
		}
	}

	if c.AppContext.Session().UserId != emoji.CreatorId {
		if !c.App.SessionHasPermissionTo(*c.AppContext.Session(), model.PermissionDeleteOthersEmojis) {
			hasPermission := false
			for _, membership := range memberships {
				if c.App.SessionHasPermissionToTeam(*c.AppContext.Session(), membership.TeamId, model.PermissionDeleteOthersEmojis) {
					hasPermission = true
					break
				}
			}

			if !hasPermission {
				c.SetPermissionError(model.PermissionDeleteOthersEmojis)
				return
			}
		}
	}

	err = c.App.DeleteEmoji(c.AppContext, emoji)
	if err != nil {
		c.Err = err
		return
	}

	auditRec.Success()

	ReturnStatusOK(w)
}

func getEmoji(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireEmojiId()
	if c.Err != nil {
		return
	}

	if !*c.App.Config().ServiceSettings.EnableCustomEmoji {
		c.Err = model.NewAppError("getEmoji", "api.emoji.disabled.app_error", nil, "", http.StatusNotImplemented)
		return
	}

	emoji, err := c.App.GetEmoji(c.AppContext, c.Params.EmojiId)
	if err != nil {
		c.Err = err
		return
	}

	if err := json.NewEncoder(w).Encode(emoji); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func getEmojiByName(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireEmojiName()
	if c.Err != nil {
		return
	}

	if !*c.App.Config().ServiceSettings.EnableCustomEmoji {
		c.Err = model.NewAppError("getEmojiByName", "api.emoji.disabled.app_error", nil, "", http.StatusNotImplemented)
		return
	}

	emoji, err := c.App.GetEmojiByName(c.AppContext, c.Params.EmojiName)
	if err != nil {
		c.Err = err
		return
	}

	if err := json.NewEncoder(w).Encode(emoji); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func getEmojisByNames(c *Context, w http.ResponseWriter, r *http.Request) {
	names, err := model.SortedArrayFromJSON(r.Body)
	if err != nil {
		c.Err = model.NewAppError("getEmojisByNames", model.PayloadParseError, nil, "", http.StatusBadRequest).Wrap(err)
		return
	} else if len(names) == 0 {
		c.SetInvalidParam("names")
		return
	}

	if !*c.App.Config().ServiceSettings.EnableCustomEmoji {
		c.Err = model.NewAppError("getEmojisByNames", "api.emoji.disabled.app_error", nil, "", http.StatusNotImplemented)
		return
	}

	if len(names) > GetEmojisByNamesMax {
		c.Err = model.NewAppError("getEmojisByNames", "api.emoji.get_multiple_by_name_too_many.request_error", map[string]any{
			"MaxNames": GetEmojisByNamesMax,
		}, "", http.StatusBadRequest)
		return
	}

	emojis, appErr := c.App.GetMultipleEmojiByName(c.AppContext, names)
	if appErr != nil {
		c.Err = appErr
		return
	}

	if err := json.NewEncoder(w).Encode(emojis); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func getEmojiImage(c *Context, w http.ResponseWriter, r *http.Request) {
	c.RequireEmojiId()
	if c.Err != nil {
		return
	}

	if !*c.App.Config().ServiceSettings.EnableCustomEmoji {
		c.Err = model.NewAppError("getEmojiImage", "api.emoji.disabled.app_error", nil, "", http.StatusNotImplemented)
		return
	}

	image, imageType, err := c.App.GetEmojiImage(c.AppContext, c.Params.EmojiId)
	if err != nil {
		c.Err = err
		return
	}

	w.Header().Set("Content-Type", "image/"+imageType)
	w.Header().Set("Cache-Control", "max-age=2592000, private")
	if _, err := w.Write(image); err != nil {
		c.Logger.Warn("Error while writing image response", mlog.Err(err))
	}
}

func searchEmojis(c *Context, w http.ResponseWriter, r *http.Request) {
	var emojiSearch model.EmojiSearch
	if jsonErr := json.NewDecoder(r.Body).Decode(&emojiSearch); jsonErr != nil {
		c.SetInvalidParamWithErr("term", jsonErr)
		return
	}

	if emojiSearch.Term == "" {
		c.SetInvalidParam("term")
		return
	}

	emojis, err := c.App.SearchEmoji(c.AppContext, emojiSearch.Term, emojiSearch.PrefixOnly, web.PerPageMaximum)
	if err != nil {
		c.Err = err
		return
	}
	emojis = filterIuinEmojisForUser(r.Context(), c.App.Srv().Store().GetInternalReplicaDB(), c.AppContext.Session().UserId, emojis)

	if err := json.NewEncoder(w).Encode(emojis); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

func autocompleteEmojis(c *Context, w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")

	if name == "" {
		c.SetInvalidURLParam("name")
		return
	}

	emojis, err := c.App.SearchEmoji(c.AppContext, name, true, EmojiMaxAutocompleteItems)
	if err != nil {
		c.Err = err
		return
	}
	emojis = filterIuinEmojisForUser(r.Context(), c.App.Srv().Store().GetInternalReplicaDB(), c.AppContext.Session().UserId, emojis)

	if err := json.NewEncoder(w).Encode(emojis); err != nil {
		c.Logger.Warn("Error while writing response", mlog.Err(err))
	}
}

// filterIuinEmojisForUser keeps legacy/global Mattermost emoji behavior while
// restricting unified IUIN assets to the current user's private library. Direct
// name/image resolution is intentionally not filtered because recipients must
// still render emoji already present in messages and reactions.
func filterIuinEmojisForUser(ctx context.Context, db *sql.DB, userID string, emojis []*model.Emoji) []*model.Emoji {
	if db == nil || len(emojis) == 0 {
		return emojis
	}

	rows, err := db.QueryContext(ctx, `
		SELECT a.EmojiId, CASE WHEN ue.UserId IS NULL THEN FALSE ELSE TRUE END
		  FROM IuinEmojiAssets a
		  LEFT JOIN IuinUserEmojis ue
		    ON ue.EmojiId = a.EmojiId AND ue.UserId = $1 AND ue.DeleteAt = 0
		 WHERE a.DeleteAt = 0`, userID)
	if err != nil {
		return emojis
	}
	defer rows.Close()

	visibility := map[string]bool{}
	for rows.Next() {
		var emojiID string
		var visible bool
		if err := rows.Scan(&emojiID, &visible); err != nil {
			return emojis
		}
		visibility[emojiID] = visible
	}

	filtered := make([]*model.Emoji, 0, len(emojis))
	for _, emoji := range emojis {
		visible, unified := visibility[emoji.Id]
		if !unified || visible {
			filtered = append(filtered, emoji)
		}
	}
	return filtered
}
