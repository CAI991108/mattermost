// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"encoding/base64"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNormalizeIuinProfileWorkspacePayloadSupportsAlternateMarkdownMainDocument(t *testing.T) {
	payload := &iuinProfileWorkspacePayload{
		RootName:   "member-profile",
		ActivePath: "docs/home.md",
		Files: []iuinProfileFilePayload{
			{Path: iuinProfileWorkspaceMainFile, Content: "# README", Type: "markdown", UpdatedAt: 1},
			{Path: "docs/home.md", Content: "# Home", Type: "markdown", UpdatedAt: 2},
			{Path: "docs/notes.txt", Content: "Notes", Type: "text", UpdatedAt: 3},
		},
	}

	pending, activePath, rootName, _, appErr := normalizeIuinProfileWorkspacePayload("user-id", "workspace-id", 10, payload, map[string]iuinProfileEntryRow{})
	require.Nil(t, appErr)
	require.Equal(t, "docs/home.md", activePath)
	require.Equal(t, "member-profile", rootName)

	pathsByType := make(map[string]string, len(pending))
	for _, entry := range pending {
		pathsByType[entry.Path] = entry.Type
	}
	require.Equal(t, "folder", pathsByType["docs"])
	require.Equal(t, "markdown", pathsByType["docs/home.md"])
	require.Equal(t, "text", pathsByType["docs/notes.txt"])
}

func TestNormalizeIuinProfileWorkspacePayloadPreservesSortOrderAndBinaryAssets(t *testing.T) {
	pngBytes := []byte{0x89, 0x50, 0x4e, 0x47}
	payload := &iuinProfileWorkspacePayload{
		RootName:   "member-profile",
		ActivePath: iuinProfileWorkspaceMainFile,
		Files: []iuinProfileFilePayload{
			{Path: iuinProfileWorkspaceMainFile, Content: "# README", Type: "markdown", SortOrder: 2, UpdatedAt: 1},
			{Path: "assets", Type: "folder", SortOrder: 0, UpdatedAt: 2},
			{
				Path:      "assets/figure.png",
				Content:   "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes),
				Type:      "asset",
				MimeType:  "image/png",
				SortOrder: 1,
				UpdatedAt: 3,
			},
		},
	}

	pending, _, _, _, appErr := normalizeIuinProfileWorkspacePayload("user-id", "workspace-id", 10, payload, map[string]iuinProfileEntryRow{})
	require.Nil(t, appErr)

	entries := make(map[string]pendingIuinProfileEntry, len(pending))
	for _, entry := range pending {
		entries[entry.Path] = entry
	}
	require.Equal(t, int64(2), entries[iuinProfileWorkspaceMainFile].SortOrder)
	require.Equal(t, int64(0), entries["assets"].SortOrder)
	require.Equal(t, int64(1), entries["assets/figure.png"].SortOrder)
	require.Equal(t, "image/png", entries["assets/figure.png"].MimeType)
	require.Equal(t, pngBytes, entries["assets/figure.png"].Content)
}

func TestNormalizeIuinProfileWorkspacePayloadRejectsNonDocumentActivePath(t *testing.T) {
	tests := []struct {
		name       string
		activePath string
	}{
		{name: "folder", activePath: "docs"},
		{name: "missing file", activePath: "missing.md"},
		{name: "non Markdown file", activePath: "notes.txt"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload := &iuinProfileWorkspacePayload{
				RootName:   "member-profile",
				ActivePath: tt.activePath,
				Files: []iuinProfileFilePayload{
					{Path: iuinProfileWorkspaceMainFile, Content: "# README", Type: "markdown", UpdatedAt: 1},
					{Path: "docs", Type: "folder", UpdatedAt: 2},
					{Path: "notes.txt", Content: "Notes", Type: "text", UpdatedAt: 3},
				},
			}

			_, activePath, _, _, appErr := normalizeIuinProfileWorkspacePayload("user-id", "workspace-id", 10, payload, map[string]iuinProfileEntryRow{})
			require.Nil(t, appErr)
			require.Equal(t, iuinProfileWorkspaceMainFile, activePath)
		})
	}
}
