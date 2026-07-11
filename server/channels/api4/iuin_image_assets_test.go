// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api4

import (
	"bytes"
	"image"
	"image/color"
	"image/gif"
	"image/png"
	"testing"
)

func TestProcessIuinImageAssetCompressesToEmojiStorageLimit(t *testing.T) {
	source := image.NewNRGBA(image.Rect(0, 0, 64, 64))
	for y := 0; y < source.Bounds().Dy(); y++ {
		for x := 0; x < source.Bounds().Dx(); x++ {
			source.SetNRGBA(x, y, color.NRGBA{
				R: uint8(x * 4),
				G: uint8(y * 4),
				B: uint8((x + y) * 2),
				A: 255,
			})
		}
	}

	var encoded bytes.Buffer
	if err := png.Encode(&encoded, source); err != nil {
		t.Fatalf("failed to encode source PNG: %v", err)
	}

	// PNG decoders permit trailing bytes after IEND. Padding creates a valid
	// image just over the 50 MiB storage limit without making this test spend
	// time encoding a huge random bitmap.
	oversized := make([]byte, iuinEmojiAssetMaxBytes+1)
	copy(oversized, encoded.Bytes())

	processed, err := processIuinImageAsset(oversized, iuinEmojiAssetMaxBytes)
	if err != nil {
		t.Fatalf("expected oversized valid PNG to be compressed, got %v", err)
	}
	if len(processed.Content) > iuinEmojiAssetMaxBytes {
		t.Fatalf("processed image is %d bytes, limit is %d", len(processed.Content), iuinEmojiAssetMaxBytes)
	}
	if len(processed.Content) >= len(oversized) {
		t.Fatalf("processed image did not shrink: got %d bytes from %d", len(processed.Content), len(oversized))
	}
}

func TestProcessIuinImageAssetGIFKeepsReducingFramesUntilTarget(t *testing.T) {
	palette := color.Palette{color.Black, color.White}
	animation := &gif.GIF{LoopCount: 0}
	for frameIndex := 0; frameIndex < 140; frameIndex++ {
		frame := image.NewPaletted(image.Rect(0, 0, 64, 64), palette)
		for y := 0; y < 64; y++ {
			for x := 0; x < 64; x++ {
				frame.SetColorIndex(x, y, uint8((x+y+frameIndex)%2))
			}
		}
		animation.Image = append(animation.Image, frame)
		animation.Delay = append(animation.Delay, 1)
	}

	var encoded bytes.Buffer
	if err := gif.EncodeAll(&encoded, animation); err != nil {
		t.Fatalf("failed to encode source GIF: %v", err)
	}

	const targetBytes = 8 * 1024
	processed, err := processIuinImageAsset(encoded.Bytes(), targetBytes)
	if err != nil {
		t.Fatalf("expected GIF to keep reducing frames until it fits, got %v", err)
	}
	if len(processed.Content) > targetBytes {
		t.Fatalf("processed GIF is %d bytes, target is %d", len(processed.Content), targetBytes)
	}
	if processed.MimeType != "image/gif" {
		t.Fatalf("expected GIF output, got %q", processed.MimeType)
	}
}

func TestIuinEmojiUploadAndStorageLimitsAreIndependent(t *testing.T) {
	if iuinEmojiUploadMaxBytes != 256*1024*1024 {
		t.Fatalf("unexpected original upload limit: %d", iuinEmojiUploadMaxBytes)
	}
	if iuinEmojiAssetMaxBytes != 50*1024*1024 {
		t.Fatalf("unexpected stored asset limit: %d", iuinEmojiAssetMaxBytes)
	}
	if iuinImageUploadReadLimit <= iuinEmojiUploadMaxBytes {
		t.Fatalf("multipart request limit %d must include overhead above file limit %d", iuinImageUploadReadLimit, iuinEmojiUploadMaxBytes)
	}
}
