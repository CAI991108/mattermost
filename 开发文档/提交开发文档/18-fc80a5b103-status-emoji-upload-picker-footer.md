# 18 - fix: move status emoji upload into picker footer

## 提交信息

- Commit: `fc80a5b103`
- Author: `RTPI-ltc <RTPI-ltc@users.noreply.github.com>`
- 类型: 修复
- 范围: 状态弹窗、emoji picker、自定义上传入口

## 简介

移除状态输入框右侧的上传按钮，把 emoji picker 底部的 Custom Emoji 改为 Upload Emoji，并复用上传逻辑。

## 开发目标

上传图片应该属于 emoji 选择流程的一部分，而不是占用状态输入框右侧空间；状态输入框需要保持 GitHub 弹窗的干净结构。

## 改动范围

- `webapp/channels/src/components/custom_status/custom_status_modal.tsx`
- `webapp/channels/src/components/emoji_picker/*`
- `webapp/channels/src/sass/components/_emoticons.scss`

## 实现说明

- 删除状态输入区右侧上传按钮。
- 在状态弹窗打开 emoji picker 时，将底部自定义入口显示为 Upload Emoji。
- 让该入口直接触发现有图片上传逻辑。

## 验证建议

- 打开状态弹窗并展开 emoji picker。
- 确认底部按钮为 Upload Emoji。
- 点击 Upload Emoji 后选择图片，确认可回填到状态弹窗。

## 回退边界

可单独回退，回退后上传入口会回到原先较割裂的位置。
