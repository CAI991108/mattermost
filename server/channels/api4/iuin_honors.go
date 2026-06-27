// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/shared/mlog"
	"github.com/mattermost/mattermost/server/v8/platform/shared/web"
)

const (
	iuinFeaturedAchievementLimit = 10
	iuinDemoUnlockedLimit        = 5
)

type iuinAchievementItem struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Description    string `json:"description"`
	IconStorageKey string `json:"iconStorageKey"`
	Category       string `json:"category"`
	Rarity         string `json:"rarity"`
	UnlockHint     string `json:"unlockHint"`
	SortOrder      int    `json:"sortOrder"`
	Unlocked       bool   `json:"unlocked"`
	Featured       bool   `json:"featured"`
	FeaturedOrder  int    `json:"featuredOrder"`
}

type iuinTitleItem struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Description    string `json:"description"`
	IconStorageKey string `json:"iconStorageKey"`
	Rarity         string `json:"rarity"`
	UnlockHint     string `json:"unlockHint"`
	SortOrder      int    `json:"sortOrder"`
	Unlocked       bool   `json:"unlocked"`
	Equipped       bool   `json:"equipped"`
}

type iuinAvatarFrameItem struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Description       string `json:"description"`
	FrameStorageKey   string `json:"frameStorageKey"`
	PreviewStorageKey string `json:"previewStorageKey"`
	Rarity            string `json:"rarity"`
	UnlockHint        string `json:"unlockHint"`
	SortOrder         int    `json:"sortOrder"`
	Unlocked          bool   `json:"unlocked"`
	Equipped          bool   `json:"equipped"`
}

type iuinHonorSummaryResponse struct {
	Title                *iuinTitleItem        `json:"title"`
	AvatarFrame          *iuinAvatarFrameItem  `json:"avatarFrame"`
	FeaturedAchievements []iuinAchievementItem `json:"featuredAchievements"`
}

type iuinAchievementsResponse struct {
	Achievements  []iuinAchievementItem `json:"achievements"`
	FeaturedLimit int                   `json:"featuredLimit"`
}

type iuinTitlesResponse struct {
	Titles []iuinTitleItem `json:"titles"`
}

type iuinAvatarFramesResponse struct {
	AvatarFrames []iuinAvatarFrameItem `json:"avatarFrames"`
}

type iuinFeaturedAchievementsRequest struct {
	AchievementIDs []string `json:"achievement_ids"`
}

type iuinEquippedTitleRequest struct {
	TitleID string `json:"title_id"`
}

type iuinEquippedAvatarFrameRequest struct {
	AvatarFrameID string `json:"avatar_frame_id"`
}

func getIuinHonorSummary(c *Context, w http.ResponseWriter, r *http.Request) {
	user, ok := getIuinHonorTargetUser(c)
	if !ok {
		return
	}

	if user.IsBot {
		writeIuinHonorsJSON(c, w, iuinHonorSummaryResponse{})
		return
	}

	if appErr := ensureIuinHonorDemoUserState(c, r.Context(), user.Id); appErr != nil {
		c.Err = appErr
		return
	}

	db := c.App.Srv().Store().GetInternalReplicaDB()
	title, appErr := selectIuinEquippedTitle(r.Context(), db, user.Id)
	if appErr != nil {
		c.Err = appErr
		return
	}
	frame, appErr := selectIuinEquippedAvatarFrame(r.Context(), db, user.Id)
	if appErr != nil {
		c.Err = appErr
		return
	}
	featured, appErr := selectIuinFeaturedAchievements(r.Context(), db, user.Id)
	if appErr != nil {
		c.Err = appErr
		return
	}

	writeIuinHonorsJSON(c, w, iuinHonorSummaryResponse{
		Title:                title,
		AvatarFrame:          frame,
		FeaturedAchievements: featured,
	})
}

func getIuinAchievements(c *Context, w http.ResponseWriter, r *http.Request) {
	user, ok := getIuinHonorTargetUser(c)
	if !ok {
		return
	}

	if user.IsBot {
		writeIuinHonorsJSON(c, w, iuinAchievementsResponse{FeaturedLimit: iuinFeaturedAchievementLimit})
		return
	}

	if appErr := ensureIuinHonorDemoUserState(c, r.Context(), user.Id); appErr != nil {
		c.Err = appErr
		return
	}

	achievements, appErr := selectIuinAchievementsForUser(r.Context(), c.App.Srv().Store().GetInternalReplicaDB(), user.Id)
	if appErr != nil {
		c.Err = appErr
		return
	}

	writeIuinHonorsJSON(c, w, iuinAchievementsResponse{
		Achievements:  achievements,
		FeaturedLimit: iuinFeaturedAchievementLimit,
	})
}

func putIuinFeaturedAchievements(c *Context, w http.ResponseWriter, r *http.Request) {
	user, ok := getIuinHonorTargetUser(c)
	if !ok {
		return
	}
	if !canManageIuinHonorUser(c, user.Id) {
		return
	}

	var request iuinFeaturedAchievementsRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		c.SetInvalidParamWithErr("featured_achievements", err)
		return
	}

	normalizedIDs := dedupeIuinHonorIDs(request.AchievementIDs)
	if len(normalizedIDs) > iuinFeaturedAchievementLimit {
		c.Err = model.NewAppError("putIuinFeaturedAchievements", "api.iuin_honors.featured_limit.app_error", nil, fmt.Sprintf("featured achievements cannot exceed %d", iuinFeaturedAchievementLimit), http.StatusBadRequest)
		return
	}

	if appErr := ensureIuinHonorDemoUserState(c, r.Context(), user.Id); appErr != nil {
		c.Err = appErr
		return
	}

	db := c.App.Srv().Store().GetInternalMasterDB()
	unlocked, appErr := selectIuinUserUnlockedIDs(r.Context(), db, "IuinUserAchievements", "AchievementId", user.Id)
	if appErr != nil {
		c.Err = appErr
		return
	}
	for _, achievementID := range normalizedIDs {
		if !unlocked[achievementID] {
			c.Err = model.NewAppError("putIuinFeaturedAchievements", "api.iuin_honors.not_unlocked.app_error", nil, "featured achievement must be unlocked", http.StatusBadRequest)
			return
		}
		visible, appErr := isIuinHonorDefinitionVisible(r.Context(), db, "IuinAchievements", achievementID)
		if appErr != nil {
			c.Err = appErr
			return
		}
		if !visible {
			c.Err = model.NewAppError("putIuinFeaturedAchievements", "api.iuin_honors.hidden.app_error", nil, "hidden achievement cannot be featured", http.StatusBadRequest)
			return
		}
	}

	if appErr := replaceIuinFeaturedAchievements(r.Context(), db, user.Id, normalizedIDs); appErr != nil {
		c.Err = appErr
		return
	}

	getIuinAchievements(c, w, r)
}

func getIuinTitles(c *Context, w http.ResponseWriter, r *http.Request) {
	user, ok := getIuinHonorTargetUser(c)
	if !ok {
		return
	}

	if user.IsBot {
		writeIuinHonorsJSON(c, w, iuinTitlesResponse{})
		return
	}

	if appErr := ensureIuinHonorDemoUserState(c, r.Context(), user.Id); appErr != nil {
		c.Err = appErr
		return
	}

	titles, appErr := selectIuinTitlesForUser(r.Context(), c.App.Srv().Store().GetInternalReplicaDB(), user.Id)
	if appErr != nil {
		c.Err = appErr
		return
	}

	writeIuinHonorsJSON(c, w, iuinTitlesResponse{Titles: titles})
}

func putIuinEquippedTitle(c *Context, w http.ResponseWriter, r *http.Request) {
	user, ok := getIuinHonorTargetUser(c)
	if !ok {
		return
	}
	if !canManageIuinHonorUser(c, user.Id) {
		return
	}

	var request iuinEquippedTitleRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		c.SetInvalidParamWithErr("title", err)
		return
	}

	if appErr := ensureIuinHonorDemoUserState(c, r.Context(), user.Id); appErr != nil {
		c.Err = appErr
		return
	}

	db := c.App.Srv().Store().GetInternalMasterDB()
	unlocked, appErr := selectIuinUserUnlockedIDs(r.Context(), db, "IuinUserTitles", "TitleId", user.Id)
	if appErr != nil {
		c.Err = appErr
		return
	}
	if request.TitleID != "" && !unlocked[request.TitleID] {
		c.Err = model.NewAppError("putIuinEquippedTitle", "api.iuin_honors.not_unlocked.app_error", nil, "equipped title must be unlocked", http.StatusBadRequest)
		return
	}
	if request.TitleID != "" {
		visible, appErr := isIuinHonorDefinitionVisible(r.Context(), db, "IuinTitles", request.TitleID)
		if appErr != nil {
			c.Err = appErr
			return
		}
		if !visible {
			c.Err = model.NewAppError("putIuinEquippedTitle", "api.iuin_honors.hidden.app_error", nil, "hidden title cannot be equipped", http.StatusBadRequest)
			return
		}
	}

	if appErr := replaceIuinTitleLoadout(r.Context(), db, user.Id, request.TitleID); appErr != nil {
		c.Err = appErr
		return
	}

	getIuinTitles(c, w, r)
}

func getIuinAvatarFrames(c *Context, w http.ResponseWriter, r *http.Request) {
	user, ok := getIuinHonorTargetUser(c)
	if !ok {
		return
	}

	if user.IsBot {
		writeIuinHonorsJSON(c, w, iuinAvatarFramesResponse{})
		return
	}

	if appErr := ensureIuinHonorDemoUserState(c, r.Context(), user.Id); appErr != nil {
		c.Err = appErr
		return
	}

	frames, appErr := selectIuinAvatarFramesForUser(r.Context(), c.App.Srv().Store().GetInternalReplicaDB(), user.Id)
	if appErr != nil {
		c.Err = appErr
		return
	}

	writeIuinHonorsJSON(c, w, iuinAvatarFramesResponse{AvatarFrames: frames})
}

func putIuinEquippedAvatarFrame(c *Context, w http.ResponseWriter, r *http.Request) {
	user, ok := getIuinHonorTargetUser(c)
	if !ok {
		return
	}
	if !canManageIuinHonorUser(c, user.Id) {
		return
	}

	var request iuinEquippedAvatarFrameRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		c.SetInvalidParamWithErr("avatar_frame", err)
		return
	}

	if appErr := ensureIuinHonorDemoUserState(c, r.Context(), user.Id); appErr != nil {
		c.Err = appErr
		return
	}

	db := c.App.Srv().Store().GetInternalMasterDB()
	unlocked, appErr := selectIuinUserUnlockedIDs(r.Context(), db, "IuinUserAvatarFrames", "AvatarFrameId", user.Id)
	if appErr != nil {
		c.Err = appErr
		return
	}
	if request.AvatarFrameID != "" && !unlocked[request.AvatarFrameID] {
		c.Err = model.NewAppError("putIuinEquippedAvatarFrame", "api.iuin_honors.not_unlocked.app_error", nil, "equipped avatar frame must be unlocked", http.StatusBadRequest)
		return
	}

	if appErr := replaceIuinAvatarFrameLoadout(r.Context(), db, user.Id, request.AvatarFrameID); appErr != nil {
		c.Err = appErr
		return
	}

	getIuinAvatarFrames(c, w, r)
}

func getIuinHonorAsset(c *Context, w http.ResponseWriter, r *http.Request) {
	assetKey, ok := normalizeIuinHonorAssetKey(r.URL.Query().Get("key"))
	if !ok {
		c.SetInvalidParam("key")
		return
	}

	fileReader, appErr := c.App.FileReader(assetKey)
	if appErr != nil {
		c.Err = appErr
		c.Err.StatusCode = http.StatusNotFound
		return
	}
	defer fileReader.Close()

	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	web.WriteFileResponse(path.Base(assetKey), iuinHonorAssetContentType(assetKey), 0, time.Unix(0, 0), *c.App.Config().ServiceSettings.WebserverMode, fileReader, false, w, r)
}

func getIuinHonorTargetUser(c *Context) (*model.User, bool) {
	c.RequireUserId()
	if c.Err != nil {
		return nil, false
	}

	user, appErr := c.App.GetUser(c.Params.UserId)
	if appErr != nil {
		c.Err = appErr
		return nil, false
	}

	return user, true
}

func canManageIuinHonorUser(c *Context, userID string) bool {
	if !c.App.SessionHasPermissionToUser(*c.AppContext.Session(), userID) {
		c.SetPermissionError(model.PermissionEditOtherUsers)
		return false
	}

	return true
}

func normalizeIuinHonorAssetKey(rawKey string) (string, bool) {
	if strings.Contains(rawKey, "\\") {
		return "", false
	}

	cleanKey := strings.TrimPrefix(path.Clean("/"+strings.TrimSpace(rawKey)), "/")
	if !strings.HasPrefix(cleanKey, "profile/honors/") {
		return "", false
	}

	switch strings.ToLower(path.Ext(cleanKey)) {
	case ".png", ".jpg", ".jpeg", ".webp", ".gif":
		return cleanKey, true
	default:
		return "", false
	}
}

func iuinHonorAssetContentType(assetKey string) string {
	switch strings.ToLower(path.Ext(assetKey)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	default:
		return "image/png"
	}
}

func writeIuinHonorsJSON(c *Context, w http.ResponseWriter, value any) {
	if err := json.NewEncoder(w).Encode(value); err != nil {
		c.Logger.Warn("Error while writing IUIN honors response", mlog.Err(err))
	}
}

func ensureIuinHonorDemoUserState(c *Context, ctx context.Context, userID string) *model.AppError {
	db := c.App.Srv().Store().GetInternalMasterDB()
	if appErr := removeIuinHiddenDemoGrants(ctx, db, userID); appErr != nil {
		return appErr
	}
	if appErr := ensureIuinDemoAchievements(ctx, db, userID); appErr != nil {
		return appErr
	}
	if appErr := ensureIuinDemoTitles(ctx, db, userID); appErr != nil {
		return appErr
	}
	if appErr := ensureIuinDemoAvatarFrames(ctx, db, userID); appErr != nil {
		return appErr
	}

	return nil
}

func removeIuinHiddenDemoGrants(ctx context.Context, db *sql.DB, userID string) *model.AppError {
	now := model.GetMillis()
	queries := []struct {
		name  string
		query string
	}{
		{
			name: "featuredAchievements",
			query: `
				UPDATE IuinFeaturedAchievements f
				SET DeleteAt = $2, UpdateAt = $2
				WHERE f.UserId = $1 AND f.DeleteAt = 0 AND EXISTS (
					SELECT 1
					FROM IuinUserAchievements u
					INNER JOIN IuinAchievements a ON a.Id = u.AchievementId AND a.DeleteAt = 0
					WHERE u.UserId = f.UserId
						AND u.AchievementId = f.AchievementId
						AND u.DeleteAt = 0
						AND u.EvidenceType = 'demo'
						AND LOWER(TRIM(a.Rarity)) = 'hidden'
				)
			`,
		},
		{
			name: "achievementGrants",
			query: `
				UPDATE IuinUserAchievements u
				SET DeleteAt = $2, UpdateAt = $2
				FROM IuinAchievements a
				WHERE u.UserId = $1
					AND u.DeleteAt = 0
					AND u.EvidenceType = 'demo'
					AND a.Id = u.AchievementId
					AND a.DeleteAt = 0
					AND LOWER(TRIM(a.Rarity)) = 'hidden'
			`,
		},
		{
			name: "titleLoadouts",
			query: `
				UPDATE IuinUserTitleLoadouts l
				SET DeleteAt = $2, UpdateAt = $2
				WHERE l.UserId = $1 AND l.DeleteAt = 0 AND EXISTS (
					SELECT 1
					FROM IuinUserTitles u
					INNER JOIN IuinTitles t ON t.Id = u.TitleId AND t.DeleteAt = 0
					WHERE u.UserId = l.UserId
						AND u.TitleId = l.TitleId
						AND u.DeleteAt = 0
						AND u.GrantType = 'demo'
						AND LOWER(TRIM(t.Rarity)) = 'hidden'
				)
			`,
		},
		{
			name: "titleGrants",
			query: `
				UPDATE IuinUserTitles u
				SET DeleteAt = $2, UpdateAt = $2
				FROM IuinTitles t
				WHERE u.UserId = $1
					AND u.DeleteAt = 0
					AND u.GrantType = 'demo'
					AND t.Id = u.TitleId
					AND t.DeleteAt = 0
					AND LOWER(TRIM(t.Rarity)) = 'hidden'
			`,
		},
	}

	for _, op := range queries {
		if _, err := db.ExecContext(ctx, op.query, userID, now); err != nil {
			return newIuinHonorsAppError("removeIuinHiddenDemoGrants."+op.name, http.StatusInternalServerError, err)
		}
	}

	return nil
}

func ensureIuinDemoAchievements(ctx context.Context, db *sql.DB, userID string) *model.AppError {
	count, err := countIuinUserHonorRows(ctx, db, "IuinUserAchievements", userID)
	if err != nil {
		return newIuinHonorsAppError("ensureIuinDemoAchievements.count", http.StatusInternalServerError, err)
	}
	if count > 0 {
		return nil
	}

	ids, err := selectIuinDemoDefinitionIDs(ctx, db, "IuinAchievements", iuinDemoUnlockedLimit)
	if err != nil {
		return newIuinHonorsAppError("ensureIuinDemoAchievements.definitions", http.StatusInternalServerError, err)
	}
	now := model.GetMillis()
	for index, id := range ids {
		if _, err := db.ExecContext(ctx, `
			INSERT INTO IuinUserAchievements
				(Id, UserId, AchievementId, UnlockedAt, EvidenceType, EvidenceId, Visibility, Payload, CreateAt, UpdateAt)
			VALUES
				($1, $2, $3, $4, 'demo', $3, 'public', '', $4, $4)
			ON CONFLICT DO NOTHING
		`, model.NewId(), userID, id, now); err != nil {
			return newIuinHonorsAppError("ensureIuinDemoAchievements.insertAchievement", http.StatusInternalServerError, err)
		}
		if _, err := db.ExecContext(ctx, `
			INSERT INTO IuinFeaturedAchievements
				(Id, UserId, AchievementId, SortOrder, CreateAt, UpdateAt)
			VALUES
				($1, $2, $3, $4, $5, $5)
			ON CONFLICT DO NOTHING
		`, model.NewId(), userID, id, index, now); err != nil {
			return newIuinHonorsAppError("ensureIuinDemoAchievements.insertFeatured", http.StatusInternalServerError, err)
		}
	}

	return nil
}

func ensureIuinDemoTitles(ctx context.Context, db *sql.DB, userID string) *model.AppError {
	count, err := countIuinUserHonorRows(ctx, db, "IuinUserTitles", userID)
	if err != nil {
		return newIuinHonorsAppError("ensureIuinDemoTitles.count", http.StatusInternalServerError, err)
	}
	if count > 0 {
		return nil
	}

	ids, err := selectIuinDemoDefinitionIDs(ctx, db, "IuinTitles", iuinDemoUnlockedLimit)
	if err != nil {
		return newIuinHonorsAppError("ensureIuinDemoTitles.definitions", http.StatusInternalServerError, err)
	}
	now := model.GetMillis()
	for _, id := range ids {
		if _, err := db.ExecContext(ctx, `
			INSERT INTO IuinUserTitles
				(Id, UserId, TitleId, GrantType, GrantSourceId, GrantedAt, CreateAt, UpdateAt)
			VALUES
				($1, $2, $3, 'demo', $3, $4, $4, $4)
			ON CONFLICT DO NOTHING
		`, model.NewId(), userID, id, now); err != nil {
			return newIuinHonorsAppError("ensureIuinDemoTitles.insertTitle", http.StatusInternalServerError, err)
		}
	}
	if len(ids) > 0 {
		if appErr := replaceIuinTitleLoadout(ctx, db, userID, ids[0]); appErr != nil {
			return appErr
		}
	}

	return nil
}

func ensureIuinDemoAvatarFrames(ctx context.Context, db *sql.DB, userID string) *model.AppError {
	count, err := countIuinUserHonorRows(ctx, db, "IuinUserAvatarFrames", userID)
	if err != nil {
		return newIuinHonorsAppError("ensureIuinDemoAvatarFrames.count", http.StatusInternalServerError, err)
	}
	if count > 0 {
		return nil
	}

	ids, err := selectIuinDemoDefinitionIDs(ctx, db, "IuinAvatarFrames", iuinDemoUnlockedLimit)
	if err != nil {
		return newIuinHonorsAppError("ensureIuinDemoAvatarFrames.definitions", http.StatusInternalServerError, err)
	}
	now := model.GetMillis()
	for _, id := range ids {
		if _, err := db.ExecContext(ctx, `
			INSERT INTO IuinUserAvatarFrames
				(Id, UserId, AvatarFrameId, GrantType, GrantSourceId, GrantedAt, CreateAt, UpdateAt)
			VALUES
				($1, $2, $3, 'demo', $3, $4, $4, $4)
			ON CONFLICT DO NOTHING
		`, model.NewId(), userID, id, now); err != nil {
			return newIuinHonorsAppError("ensureIuinDemoAvatarFrames.insertFrame", http.StatusInternalServerError, err)
		}
	}
	if len(ids) > 0 {
		if appErr := replaceIuinAvatarFrameLoadout(ctx, db, userID, ids[0]); appErr != nil {
			return appErr
		}
	}

	return nil
}

func countIuinUserHonorRows(ctx context.Context, db *sql.DB, table string, userID string) (int, error) {
	query := fmt.Sprintf("SELECT COUNT(1) FROM %s WHERE UserId = $1 AND DeleteAt = 0", table)
	var count int
	if err := db.QueryRowContext(ctx, query, userID).Scan(&count); err != nil {
		return 0, err
	}

	return count, nil
}

func selectIuinDemoDefinitionIDs(ctx context.Context, db *sql.DB, table string, limit int) ([]string, error) {
	query := fmt.Sprintf("SELECT Id FROM %s WHERE DeleteAt = 0 AND LOWER(TRIM(Rarity)) <> 'hidden' ORDER BY SortOrder, Id LIMIT $1", table)
	rows, err := db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return ids, nil
}

func selectIuinAchievementsForUser(ctx context.Context, db *sql.DB, userID string) ([]iuinAchievementItem, *model.AppError) {
	unlocked, appErr := selectIuinUserUnlockedIDs(ctx, db, "IuinUserAchievements", "AchievementId", userID)
	if appErr != nil {
		return nil, appErr
	}
	featured, appErr := selectIuinFeaturedAchievementOrder(ctx, db, userID)
	if appErr != nil {
		return nil, appErr
	}

	rows, err := db.QueryContext(ctx, `
		SELECT Id, Name, Description, IconStorageKey, Category, Rarity, UnlockHint, SortOrder
		FROM IuinAchievements
		WHERE DeleteAt = 0
		ORDER BY SortOrder, Id
	`)
	if err != nil {
		return nil, newIuinHonorsAppError("selectIuinAchievementsForUser", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	achievements := []iuinAchievementItem{}
	for rows.Next() {
		var item iuinAchievementItem
		if err := rows.Scan(&item.ID, &item.Name, &item.Description, &item.IconStorageKey, &item.Category, &item.Rarity, &item.UnlockHint, &item.SortOrder); err != nil {
			return nil, newIuinHonorsAppError("selectIuinAchievementsForUser.scan", http.StatusInternalServerError, err)
		}
		item.Unlocked = unlocked[item.ID]
		if order, ok := featured[item.ID]; ok {
			item.Featured = true
			item.FeaturedOrder = order
		}
		if isIuinHiddenRarity(item.Rarity) {
			continue
		}
		achievements = append(achievements, item)
	}
	if err := rows.Err(); err != nil {
		return nil, newIuinHonorsAppError("selectIuinAchievementsForUser.rows", http.StatusInternalServerError, err)
	}

	sortIuinAchievementsForUser(achievements)

	return achievements, nil
}

func selectIuinFeaturedAchievements(ctx context.Context, db *sql.DB, userID string) ([]iuinAchievementItem, *model.AppError) {
	rows, err := db.QueryContext(ctx, `
		SELECT a.Id, a.Name, a.Description, a.IconStorageKey, a.Category, a.Rarity, a.UnlockHint, a.SortOrder, f.SortOrder
		FROM IuinFeaturedAchievements f
		INNER JOIN IuinAchievements a ON a.Id = f.AchievementId AND a.DeleteAt = 0
		WHERE f.UserId = $1 AND f.DeleteAt = 0 AND LOWER(TRIM(a.Rarity)) <> 'hidden'
		ORDER BY f.SortOrder, a.SortOrder, a.Id
		LIMIT $2
	`, userID, iuinFeaturedAchievementLimit)
	if err != nil {
		return nil, newIuinHonorsAppError("selectIuinFeaturedAchievements", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	achievements := []iuinAchievementItem{}
	for rows.Next() {
		var item iuinAchievementItem
		if err := rows.Scan(&item.ID, &item.Name, &item.Description, &item.IconStorageKey, &item.Category, &item.Rarity, &item.UnlockHint, &item.SortOrder, &item.FeaturedOrder); err != nil {
			return nil, newIuinHonorsAppError("selectIuinFeaturedAchievements.scan", http.StatusInternalServerError, err)
		}
		item.Unlocked = true
		item.Featured = true
		achievements = append(achievements, item)
	}
	if err := rows.Err(); err != nil {
		return nil, newIuinHonorsAppError("selectIuinFeaturedAchievements.rows", http.StatusInternalServerError, err)
	}

	return achievements, nil
}

func selectIuinTitlesForUser(ctx context.Context, db *sql.DB, userID string) ([]iuinTitleItem, *model.AppError) {
	unlocked, appErr := selectIuinUserUnlockedIDs(ctx, db, "IuinUserTitles", "TitleId", userID)
	if appErr != nil {
		return nil, appErr
	}
	equippedID, appErr := selectIuinEquippedID(ctx, db, "IuinUserTitleLoadouts", "TitleId", userID)
	if appErr != nil {
		return nil, appErr
	}

	rows, err := db.QueryContext(ctx, `
		SELECT Id, Name, Description, IconStorageKey, Rarity, UnlockHint, SortOrder
		FROM IuinTitles
		WHERE DeleteAt = 0
		ORDER BY SortOrder, Id
	`)
	if err != nil {
		return nil, newIuinHonorsAppError("selectIuinTitlesForUser", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	titles := []iuinTitleItem{}
	for rows.Next() {
		var item iuinTitleItem
		if err := rows.Scan(&item.ID, &item.Name, &item.Description, &item.IconStorageKey, &item.Rarity, &item.UnlockHint, &item.SortOrder); err != nil {
			return nil, newIuinHonorsAppError("selectIuinTitlesForUser.scan", http.StatusInternalServerError, err)
		}
		item.Unlocked = unlocked[item.ID]
		item.Equipped = item.ID == equippedID
		if isIuinHiddenRarity(item.Rarity) && !item.Unlocked {
			continue
		}
		titles = append(titles, item)
	}
	if err := rows.Err(); err != nil {
		return nil, newIuinHonorsAppError("selectIuinTitlesForUser.rows", http.StatusInternalServerError, err)
	}

	sortIuinTitlesForUser(titles)

	return titles, nil
}

func selectIuinAvatarFramesForUser(ctx context.Context, db *sql.DB, userID string) ([]iuinAvatarFrameItem, *model.AppError) {
	unlocked, appErr := selectIuinUserUnlockedIDs(ctx, db, "IuinUserAvatarFrames", "AvatarFrameId", userID)
	if appErr != nil {
		return nil, appErr
	}
	equippedID, appErr := selectIuinEquippedID(ctx, db, "IuinUserAvatarFrameLoadouts", "AvatarFrameId", userID)
	if appErr != nil {
		return nil, appErr
	}

	rows, err := db.QueryContext(ctx, `
		SELECT Id, Name, Description, FrameStorageKey, PreviewStorageKey, Rarity, UnlockHint, SortOrder
		FROM IuinAvatarFrames
		WHERE DeleteAt = 0
		ORDER BY SortOrder, Id
	`)
	if err != nil {
		return nil, newIuinHonorsAppError("selectIuinAvatarFramesForUser", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	frames := []iuinAvatarFrameItem{}
	for rows.Next() {
		var item iuinAvatarFrameItem
		if err := rows.Scan(&item.ID, &item.Name, &item.Description, &item.FrameStorageKey, &item.PreviewStorageKey, &item.Rarity, &item.UnlockHint, &item.SortOrder); err != nil {
			return nil, newIuinHonorsAppError("selectIuinAvatarFramesForUser.scan", http.StatusInternalServerError, err)
		}
		item.Unlocked = unlocked[item.ID]
		item.Equipped = item.ID == equippedID
		if isIuinHiddenRarity(item.Rarity) {
			continue
		}
		frames = append(frames, item)
	}
	if err := rows.Err(); err != nil {
		return nil, newIuinHonorsAppError("selectIuinAvatarFramesForUser.rows", http.StatusInternalServerError, err)
	}

	sortIuinAvatarFramesForUser(frames)

	return frames, nil
}

func sortIuinAchievementsForUser(items []iuinAchievementItem) {
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Unlocked != items[j].Unlocked {
			return items[i].Unlocked
		}
		if items[i].SortOrder != items[j].SortOrder {
			return items[i].SortOrder < items[j].SortOrder
		}
		return items[i].ID < items[j].ID
	})
}

func sortIuinTitlesForUser(items []iuinTitleItem) {
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Unlocked != items[j].Unlocked {
			return items[i].Unlocked
		}
		if items[i].SortOrder != items[j].SortOrder {
			return items[i].SortOrder < items[j].SortOrder
		}
		return items[i].ID < items[j].ID
	})
}

func sortIuinAvatarFramesForUser(items []iuinAvatarFrameItem) {
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Unlocked != items[j].Unlocked {
			return items[i].Unlocked
		}
		if items[i].SortOrder != items[j].SortOrder {
			return items[i].SortOrder < items[j].SortOrder
		}
		return items[i].ID < items[j].ID
	})
}

func isIuinHiddenRarity(rarity string) bool {
	return strings.EqualFold(strings.TrimSpace(rarity), "hidden")
}

func isIuinHonorDefinitionVisible(ctx context.Context, db *sql.DB, table string, id string) (bool, *model.AppError) {
	query := fmt.Sprintf("SELECT Rarity FROM %s WHERE Id = $1 AND DeleteAt = 0", table)
	var rarity string
	if err := db.QueryRowContext(ctx, query, id).Scan(&rarity); err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, newIuinHonorsAppError("isIuinHonorDefinitionVisible", http.StatusInternalServerError, err)
	}

	return !isIuinHiddenRarity(rarity), nil
}

func selectIuinEquippedTitle(ctx context.Context, db *sql.DB, userID string) (*iuinTitleItem, *model.AppError) {
	rows, err := db.QueryContext(ctx, `
		SELECT t.Id, t.Name, t.Description, t.IconStorageKey, t.Rarity, t.UnlockHint, t.SortOrder
		FROM IuinUserTitleLoadouts l
		INNER JOIN IuinTitles t ON t.Id = l.TitleId AND t.DeleteAt = 0
		WHERE l.UserId = $1 AND l.DeleteAt = 0 AND LOWER(TRIM(t.Rarity)) <> 'hidden'
		LIMIT 1
	`, userID)
	if err != nil {
		return nil, newIuinHonorsAppError("selectIuinEquippedTitle", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, nil
	}

	var item iuinTitleItem
	if err := rows.Scan(&item.ID, &item.Name, &item.Description, &item.IconStorageKey, &item.Rarity, &item.UnlockHint, &item.SortOrder); err != nil {
		return nil, newIuinHonorsAppError("selectIuinEquippedTitle.scan", http.StatusInternalServerError, err)
	}
	item.Unlocked = true
	item.Equipped = true

	return &item, nil
}

func selectIuinEquippedAvatarFrame(ctx context.Context, db *sql.DB, userID string) (*iuinAvatarFrameItem, *model.AppError) {
	rows, err := db.QueryContext(ctx, `
		SELECT f.Id, f.Name, f.Description, f.FrameStorageKey, f.PreviewStorageKey, f.Rarity, f.UnlockHint, f.SortOrder
		FROM IuinUserAvatarFrameLoadouts l
		INNER JOIN IuinAvatarFrames f ON f.Id = l.AvatarFrameId AND f.DeleteAt = 0
		INNER JOIN IuinUserAvatarFrames u ON u.UserId = l.UserId AND u.AvatarFrameId = l.AvatarFrameId AND u.DeleteAt = 0
		WHERE l.UserId = $1 AND l.DeleteAt = 0
		LIMIT 1
	`, userID)
	if err != nil {
		return nil, newIuinHonorsAppError("selectIuinEquippedAvatarFrame", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, nil
	}

	var item iuinAvatarFrameItem
	if err := rows.Scan(&item.ID, &item.Name, &item.Description, &item.FrameStorageKey, &item.PreviewStorageKey, &item.Rarity, &item.UnlockHint, &item.SortOrder); err != nil {
		return nil, newIuinHonorsAppError("selectIuinEquippedAvatarFrame.scan", http.StatusInternalServerError, err)
	}
	item.Unlocked = true
	item.Equipped = true

	return &item, nil
}

func selectIuinUserUnlockedIDs(ctx context.Context, db *sql.DB, table string, idColumn string, userID string) (map[string]bool, *model.AppError) {
	query := fmt.Sprintf("SELECT %s FROM %s WHERE UserId = $1 AND DeleteAt = 0", idColumn, table)
	rows, err := db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, newIuinHonorsAppError("selectIuinUserUnlockedIDs", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	ids := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, newIuinHonorsAppError("selectIuinUserUnlockedIDs.scan", http.StatusInternalServerError, err)
		}
		ids[id] = true
	}
	if err := rows.Err(); err != nil {
		return nil, newIuinHonorsAppError("selectIuinUserUnlockedIDs.rows", http.StatusInternalServerError, err)
	}

	return ids, nil
}

func selectIuinFeaturedAchievementOrder(ctx context.Context, db *sql.DB, userID string) (map[string]int, *model.AppError) {
	rows, err := db.QueryContext(ctx, `
		SELECT AchievementId, SortOrder
		FROM IuinFeaturedAchievements
		WHERE UserId = $1 AND DeleteAt = 0
		ORDER BY SortOrder, AchievementId
		LIMIT $2
	`, userID, iuinFeaturedAchievementLimit)
	if err != nil {
		return nil, newIuinHonorsAppError("selectIuinFeaturedAchievementOrder", http.StatusInternalServerError, err)
	}
	defer rows.Close()

	order := map[string]int{}
	for rows.Next() {
		var id string
		var sortOrder int
		if err := rows.Scan(&id, &sortOrder); err != nil {
			return nil, newIuinHonorsAppError("selectIuinFeaturedAchievementOrder.scan", http.StatusInternalServerError, err)
		}
		order[id] = sortOrder
	}
	if err := rows.Err(); err != nil {
		return nil, newIuinHonorsAppError("selectIuinFeaturedAchievementOrder.rows", http.StatusInternalServerError, err)
	}

	return order, nil
}

func selectIuinEquippedID(ctx context.Context, db *sql.DB, table string, idColumn string, userID string) (string, *model.AppError) {
	query := fmt.Sprintf("SELECT %s FROM %s WHERE UserId = $1 AND DeleteAt = 0 LIMIT 1", idColumn, table)
	var id string
	if err := db.QueryRowContext(ctx, query, userID).Scan(&id); err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", newIuinHonorsAppError("selectIuinEquippedID", http.StatusInternalServerError, err)
	}

	return id, nil
}

func replaceIuinFeaturedAchievements(ctx context.Context, db *sql.DB, userID string, achievementIDs []string) *model.AppError {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return newIuinHonorsAppError("replaceIuinFeaturedAchievements.begin", http.StatusInternalServerError, err)
	}
	defer tx.Rollback()

	now := model.GetMillis()
	if _, err := tx.ExecContext(ctx, `UPDATE IuinFeaturedAchievements SET DeleteAt = $1, UpdateAt = $1 WHERE UserId = $2 AND DeleteAt = 0`, now, userID); err != nil {
		return newIuinHonorsAppError("replaceIuinFeaturedAchievements.delete", http.StatusInternalServerError, err)
	}
	for index, achievementID := range achievementIDs {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO IuinFeaturedAchievements
				(Id, UserId, AchievementId, SortOrder, CreateAt, UpdateAt)
			VALUES
				($1, $2, $3, $4, $5, $5)
		`, model.NewId(), userID, achievementID, index, now); err != nil {
			return newIuinHonorsAppError("replaceIuinFeaturedAchievements.insert", http.StatusInternalServerError, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return newIuinHonorsAppError("replaceIuinFeaturedAchievements.commit", http.StatusInternalServerError, err)
	}

	return nil
}

func replaceIuinTitleLoadout(ctx context.Context, db *sql.DB, userID string, titleID string) *model.AppError {
	return replaceIuinSingleLoadout(ctx, db, "IuinUserTitleLoadouts", "TitleId", userID, titleID)
}

func replaceIuinAvatarFrameLoadout(ctx context.Context, db *sql.DB, userID string, avatarFrameID string) *model.AppError {
	return replaceIuinSingleLoadout(ctx, db, "IuinUserAvatarFrameLoadouts", "AvatarFrameId", userID, avatarFrameID)
}

func replaceIuinSingleLoadout(ctx context.Context, db *sql.DB, table string, idColumn string, userID string, itemID string) *model.AppError {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return newIuinHonorsAppError("replaceIuinSingleLoadout.begin", http.StatusInternalServerError, err)
	}
	defer tx.Rollback()

	now := model.GetMillis()
	if _, err := tx.ExecContext(ctx, fmt.Sprintf("UPDATE %s SET DeleteAt = $1, UpdateAt = $1 WHERE UserId = $2 AND DeleteAt = 0", table), now, userID); err != nil {
		return newIuinHonorsAppError("replaceIuinSingleLoadout.delete", http.StatusInternalServerError, err)
	}
	if itemID != "" {
		if _, err := tx.ExecContext(ctx, fmt.Sprintf(`
			INSERT INTO %s
				(Id, UserId, %s, CreateAt, UpdateAt)
			VALUES
				($1, $2, $3, $4, $4)
		`, table, idColumn), model.NewId(), userID, itemID, now); err != nil {
			return newIuinHonorsAppError("replaceIuinSingleLoadout.insert", http.StatusInternalServerError, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return newIuinHonorsAppError("replaceIuinSingleLoadout.commit", http.StatusInternalServerError, err)
	}

	return nil
}

func dedupeIuinHonorIDs(ids []string) []string {
	seen := map[string]bool{}
	next := []string{}
	for _, id := range ids {
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		next = append(next, id)
	}

	return next
}

func newIuinHonorsAppError(where string, statusCode int, err error) *model.AppError {
	return model.NewAppError(where, "api.iuin_honors.storage_error", nil, "", statusCode).Wrap(err)
}
