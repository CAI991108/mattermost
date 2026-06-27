// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ChangeEvent, DragEvent, FormEvent, PointerEvent} from 'react';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {defineMessage} from 'react-intl';
import type {RouteComponentProps} from 'react-router-dom';

import {Client4} from 'mattermost-redux/client';

import IuinHonorRarityTag from 'components/iuin_honor_rarity_tag';
import AdminHeader from 'components/widgets/admin_console/admin_header';
import AdminPanel from 'components/widgets/admin_console/admin_panel';

import {IUIN_HONOR_RARITIES, getIuinHonorAssetUrl} from 'utils/iuin_honors';

import './iuin_honors_admin.scss';

type HonorKind = 'avatar_frames' | 'titles' | 'achievements';
type ActiveTab = HonorKind | 'drafts' | 'audit';

type HonorAdminSession = {
    username: string;
    canAudit: boolean;
};

type HonorAdminItem = {
    id: string;
    name: string;
    description: string;
    iconStorageKey: string;
    category: string;
    rarity: string;
    unlockHint: string;
    frameStorageKey: string;
    previewStorageKey: string;
    sortOrder: number;
    contributorUserId: string;
    contributorUsername: string;
};

type HonorAdminAudit = {
    id: string;
    actorUserId: string;
    actorUsername: string;
    action: string;
    targetType: string;
    targetId: string;
    summary: string;
    beforePayload: string;
    afterPayload: string;
    createAt: number;
};

type HonorAdminDraft = {
    draftId: string;
    ownerUserId: string;
    ownerUsername: string;
    kind: HonorKind;
    item: HonorAdminItem;
    createAt: number;
    updateAt: number;
};

type AssetDraft = {
    file: File;
    url: string;
    naturalWidth: number;
    naturalHeight: number;
    offsetX: number;
    offsetY: number;
    scale: number;
};

type DragState = {
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
};

type AvatarSampleUser = {
    id: string;
    last_picture_update?: number;
};

const HONOR_TABS: Array<{id: HonorKind; label: string; icon: string}> = [
    {id: 'avatar_frames', label: '头像框', icon: 'icon-account-box-outline'},
    {id: 'titles', label: '称号', icon: 'icon-tag-outline'},
    {id: 'achievements', label: '成就', icon: 'icon-trophy-outline'},
];

const EMPTY_ITEM: HonorAdminItem = {
    id: '',
    name: '',
    description: '',
    iconStorageKey: '',
    category: '',
    rarity: 'common',
    unlockHint: '',
    frameStorageKey: '',
    previewStorageKey: '',
    sortOrder: 0,
    contributorUserId: '',
    contributorUsername: '',
};

const FRAME_CANVAS_SIZE = 512;
const FRAME_PREVIEW_SIZE = 224;
const HONOR_IMAGE_CANVAS_SIZE = 512;
const HONOR_IMAGE_PREVIEW_SIZE = 224;
const TITLE_IMAGE_CANVAS_WIDTH = 640;
const TITLE_IMAGE_CANVAS_HEIGHT = 200;
const HONOR_ADMIN_REQUEST_TIMEOUT = 15000;
const HONOR_ADMIN_API_BASE = '/api/v4/iuin/honors_admin';

const RESOURCE_PANEL_COPY = {
    avatar_frames: {
        title: defineMessage({id: 'iuin.honors_admin.avatar_frames.title', defaultMessage: '头像框资源'}),
        subtitle: defineMessage({id: 'iuin.honors_admin.avatar_frames.subtitle', defaultMessage: '管理头像框素材、展示说明和解锁条件。'}),
    },
    titles: {
        title: defineMessage({id: 'iuin.honors_admin.titles.title', defaultMessage: '称号资源'}),
        subtitle: defineMessage({id: 'iuin.honors_admin.titles.subtitle', defaultMessage: '管理称号图片、名称、说明和解锁条件。'}),
    },
    achievements: {
        title: defineMessage({id: 'iuin.honors_admin.achievements.title', defaultMessage: '成就资源'}),
        subtitle: defineMessage({id: 'iuin.honors_admin.achievements.subtitle', defaultMessage: '管理成就图标、分类、说明和解锁条件。'}),
    },
};

const AUDIT_PANEL_COPY = {
    title: defineMessage({id: 'iuin.honors_admin.audit.title', defaultMessage: '审计记录'}),
    subtitle: defineMessage({id: 'iuin.honors_admin.audit.subtitle', defaultMessage: '查看荣誉资源的创建、修改、上传和删除记录。'}),
};

const DRAFT_PANEL_COPY = {
    title: defineMessage({id: 'iuin.honors_admin.drafts.title', defaultMessage: '我的草稿'}),
    subtitle: defineMessage({id: 'iuin.honors_admin.drafts.subtitle', defaultMessage: '保存未发布资源，发布后才会进入正式荣誉系统。'}),
};

export default function IuinHonorsAdminPage(props: RouteComponentProps) {
    const routePathname = props.location.pathname;
    const [session, setSession] = useState<HonorAdminSession | null>(null);
    const [sessionError, setSessionError] = useState('');
    const [activeTab, setActiveTab] = useState<ActiveTab>('avatar_frames');
    const [itemsByKind, setItemsByKind] = useState<Record<HonorKind, HonorAdminItem[]>>({
        avatar_frames: [],
        titles: [],
        achievements: [],
    });
    const [drafts, setDrafts] = useState<HonorAdminDraft[]>([]);
    const [audits, setAudits] = useState<HonorAdminAudit[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [sampleAvatarUrl, setSampleAvatarUrl] = useState('');
    const [editingKind, setEditingKind] = useState<HonorKind>('avatar_frames');
    const [editingOriginalId, setEditingOriginalId] = useState('');
    const [editingDraftId, setEditingDraftId] = useState('');
    const [editorVisible, setEditorVisible] = useState(false);
    const [draft, setDraft] = useState<HonorAdminItem>(EMPTY_ITEM);
    const [assetDraft, setAssetDraft] = useState<AssetDraft | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<{kind: HonorKind; item: HonorAdminItem} | null>(null);
    const [draftDeleteTarget, setDraftDeleteTarget] = useState<HonorAdminDraft | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const activeKind = activeTab === 'audit' || activeTab === 'drafts' ? null : activeTab;
    const activeItems = activeKind ? itemsByKind[activeKind] : [];

    const loadSession = useCallback(async () => {
        const response = await fetchHonorAdmin(`${HONOR_ADMIN_API_BASE}/session`, Client4.getOptions({method: 'GET'}));
        if (!response.ok) {
            throw new Error(response.status === 403 ? '当前 Mattermost 账号没有荣誉管理权限。' : '无法读取管理权限。');
        }
        return response.json() as Promise<HonorAdminSession>;
    }, []);

    const loadSampleAvatarUrl = useCallback(async () => {
        try {
            const currentUser = await Client4.getMe() as AvatarSampleUser;
            return currentUser.id ? Client4.getProfilePictureUrl(currentUser.id, currentUser.last_picture_update || 0) : '';
        } catch {
            return '';
        }
    }, []);

    const loadItems = useCallback(async (kind: HonorKind) => {
        const response = await fetchHonorAdmin(`${HONOR_ADMIN_API_BASE}/items/${kind}`, Client4.getOptions({method: 'GET'}));
        if (!response.ok) {
            throw new Error('无法加载资源列表。');
        }
        const body = await response.json() as {items: HonorAdminItem[]};
        return body.items;
    }, []);

    const loadAudits = useCallback(async () => {
        const response = await fetchHonorAdmin(`${HONOR_ADMIN_API_BASE}/audits`, Client4.getOptions({method: 'GET'}));
        if (!response.ok) {
            throw new Error('无法加载审计记录。');
        }
        const body = await response.json() as {audits: HonorAdminAudit[]};
        return body.audits;
    }, []);

    const loadDrafts = useCallback(async () => {
        const response = await fetchHonorAdmin(`${HONOR_ADMIN_API_BASE}/drafts`, Client4.getOptions({method: 'GET'}));
        if (!response.ok) {
            throw new Error('无法加载草稿。');
        }
        const body = await response.json() as {drafts: HonorAdminDraft[]};
        return body.drafts;
    }, []);

    const refreshKind = useCallback(async (kind: HonorKind) => {
        const items = await loadItems(kind);
        setItemsByKind((previous) => ({...previous, [kind]: items}));
    }, [loadItems]);

    const refreshDrafts = useCallback(async () => {
        setDrafts(await loadDrafts());
    }, [loadDrafts]);

    const refreshAll = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const nextSession = await loadSession();
            setSession(nextSession);
            const [avatarFrames, titles, achievements, nextDrafts, nextSampleAvatarUrl] = await Promise.all([
                loadItems('avatar_frames'),
                loadItems('titles'),
                loadItems('achievements'),
                loadDrafts(),
                loadSampleAvatarUrl(),
            ]);
            setItemsByKind({
                avatar_frames: avatarFrames,
                titles,
                achievements,
            });
            setDrafts(nextDrafts);
            setSampleAvatarUrl(nextSampleAvatarUrl);
            if (nextSession.canAudit) {
                setAudits(await loadAudits());
            }
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : '无法打开荣誉管理台。';
            setSessionError(message);
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [loadAudits, loadDrafts, loadItems, loadSampleAvatarUrl, loadSession]);

    useEffect(() => {
        refreshAll();
    }, [refreshAll]);

    useEffect(() => {
        if (activeTab === 'audit' && session?.canAudit) {
            loadAudits().then(setAudits).catch((auditError) => {
                setError(auditError instanceof Error ? auditError.message : '无法加载审计记录。');
            });
        }
    }, [activeTab, loadAudits, session?.canAudit]);

    useEffect(() => {
        const assetUrl = assetDraft?.url;
        return () => {
            if (assetUrl) {
                URL.revokeObjectURL(assetUrl);
            }
        };
    }, [assetDraft?.url]);

    const startCreate = useCallback((kind: HonorKind) => {
        setEditingKind(kind);
        setEditingOriginalId('');
        setEditingDraftId('');
        setEditorVisible(true);
        setDraft({...EMPTY_ITEM, id: generateHonorAdminId(kind), rarity: 'common', sortOrder: nextSortOrder(itemsByKind[kind])});
        setAssetDraft(null);
        setError('');
    }, [itemsByKind]);

    const startEdit = useCallback((kind: HonorKind, item: HonorAdminItem) => {
        setEditingKind(kind);
        setEditingOriginalId(item.id);
        setEditingDraftId('');
        setEditorVisible(true);
        setDraft({...item});
        setAssetDraft(null);
        setError('');
    }, []);

    const startEditDraft = useCallback((nextDraft: HonorAdminDraft) => {
        setEditingKind(nextDraft.kind);
        setEditingOriginalId('');
        setEditingDraftId(nextDraft.draftId);
        setEditorVisible(true);
        setDraft({...EMPTY_ITEM, ...nextDraft.item});
        setAssetDraft(null);
        setError('');
    }, []);

    const closeEditor = useCallback(() => {
        setEditingOriginalId('');
        setEditingDraftId('');
        setEditorVisible(false);
        setDraft(EMPTY_ITEM);
        setAssetDraft(null);
        setError('');
    }, []);

    const editorOpen = editorVisible;

    const handleFieldChange = useCallback((field: keyof HonorAdminItem, value: string | number) => {
        setDraft((previous) => ({...previous, [field]: value}));
    }, []);

    const handleAssetPick = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) {
            return;
        }
        if (!isSupportedHonorAsset(file)) {
            setError('请上传 PNG、JPG、WebP 或 GIF。');
            return;
        }
        if (assetDraft) {
            URL.revokeObjectURL(assetDraft.url);
        }
        const url = URL.createObjectURL(file);
        setAssetDraft({
            file,
            url,
            naturalWidth: 0,
            naturalHeight: 0,
            offsetX: 0,
            offsetY: 0,
            scale: 1,
        });
        setError('');
    }, [assetDraft]);

    const openAssetPicker = useCallback(() => {
        if (!draft.id.trim()) {
            setDraft((previous) => ({...previous, id: generateHonorAdminId(editingKind)}));
        }
        fileInputRef.current?.click();
    }, [draft.id, editingKind]);

    const prepareEditorPayload = useCallback(async (requireComplete: boolean) => {
        const creatingFormalItem = editingOriginalId === '' && editingDraftId === '';
        const nextId = draft.id.trim() || (creatingFormalItem || editingDraftId ? generateHonorAdminId(editingKind) : '');
        const payload = {...draft, id: nextId};
        if (!payload.id) {
            throw new Error('ID 要填写。');
        }
        if (!isValidHonorAdminId(payload.id)) {
            throw new Error('ID 只能包含字母、数字、下划线和中划线，最多 64 个字符。');
        }
        if (requireComplete && (!payload.name.trim() || !payload.description.trim() || !payload.unlockHint.trim())) {
            throw new Error('名字、介绍和解锁条件都要填写。');
        }
        if (assetDraft) {
            const storageKey = await uploadAssetForDraft(editingKind, payload.id, assetDraft);
            if (editingKind === 'avatar_frames') {
                payload.frameStorageKey = storageKey;
                payload.previewStorageKey = storageKey;
            } else {
                payload.iconStorageKey = storageKey;
            }
        }
        if (requireComplete && !hasHonorAsset(editingKind, payload)) {
            throw new Error(`发布${kindLabel(editingKind)}需要上传素材。`);
        }
        return payload;
    }, [assetDraft, draft, editingDraftId, editingKind, editingOriginalId]);

    const publishEditor = useCallback(async (event: FormEvent) => {
        event.preventDefault();
        if (saving) {
            return;
        }
        setSaving(true);
        setError('');
        try {
            const payload = await prepareEditorPayload(true);
            if (editingDraftId) {
                const draftResponse = await fetchHonorAdmin(`${HONOR_ADMIN_API_BASE}/drafts/${encodeURIComponent(editingDraftId)}`, Client4.getOptions({
                    method: 'PUT',
                    body: JSON.stringify({kind: editingKind, item: payload}),
                }));
                if (!draftResponse.ok) {
                    throw new Error(await readErrorMessage(draftResponse));
                }
                const publishResponse = await fetchHonorAdmin(`${HONOR_ADMIN_API_BASE}/drafts/${encodeURIComponent(editingDraftId)}/publish`, Client4.getOptions({method: 'POST'}));
                if (!publishResponse.ok) {
                    throw new Error(await readErrorMessage(publishResponse));
                }
            } else {
                const creating = editingOriginalId === '';
                const url = creating ?
                    `${HONOR_ADMIN_API_BASE}/items/${editingKind}` :
                    `${HONOR_ADMIN_API_BASE}/items/${editingKind}/${encodeURIComponent(editingOriginalId)}`;
                const response = await fetchHonorAdmin(url, Client4.getOptions({
                    method: creating ? 'POST' : 'PUT',
                    body: JSON.stringify(payload),
                }));
                if (!response.ok) {
                    throw new Error(await readErrorMessage(response));
                }
            }

            await refreshKind(editingKind);
            await refreshDrafts();
            if (session?.canAudit) {
                setAudits(await loadAudits());
            }
            setActiveTab(editingKind);
            closeEditor();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : '保存失败。');
        } finally {
            setSaving(false);
        }
    }, [closeEditor, editingDraftId, editingKind, editingOriginalId, loadAudits, prepareEditorPayload, refreshDrafts, refreshKind, saving, session?.canAudit]);

    const storeEditorDraft = useCallback(async () => {
        if (saving) {
            return;
        }
        setSaving(true);
        setError('');
        try {
            const payload = await prepareEditorPayload(false);
            const url = editingDraftId ?
                `${HONOR_ADMIN_API_BASE}/drafts/${encodeURIComponent(editingDraftId)}` :
                `${HONOR_ADMIN_API_BASE}/drafts`;
            const response = await fetchHonorAdmin(url, Client4.getOptions({
                method: editingDraftId ? 'PUT' : 'POST',
                body: JSON.stringify({kind: editingKind, item: payload}),
            }));
            if (!response.ok) {
                throw new Error(await readErrorMessage(response));
            }
            await refreshDrafts();
            if (session?.canAudit) {
                setAudits(await loadAudits());
            }
            setActiveTab('drafts');
            closeEditor();
        } catch (draftError) {
            setError(draftError instanceof Error ? draftError.message : '保存草稿失败。');
        } finally {
            setSaving(false);
        }
    }, [closeEditor, editingDraftId, editingKind, loadAudits, prepareEditorPayload, refreshDrafts, saving, session?.canAudit]);

    const confirmDelete = useCallback(async () => {
        if (!deleteTarget || saving) {
            return;
        }
        setSaving(true);
        setError('');
        try {
            const response = await fetchHonorAdmin(`${HONOR_ADMIN_API_BASE}/items/${deleteTarget.kind}/${encodeURIComponent(deleteTarget.item.id)}`, Client4.getOptions({method: 'DELETE'}));
            if (!response.ok) {
                throw new Error(await readErrorMessage(response));
            }
            await refreshKind(deleteTarget.kind);
            if (session?.canAudit) {
                setAudits(await loadAudits());
            }
            setDeleteTarget(null);
            if (editingOriginalId === deleteTarget.item.id) {
                closeEditor();
            }
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : '删除失败。');
        } finally {
            setSaving(false);
        }
    }, [closeEditor, deleteTarget, editingOriginalId, loadAudits, refreshKind, saving, session?.canAudit]);

    const publishDraft = useCallback(async (nextDraft: HonorAdminDraft) => {
        if (saving) {
            return;
        }
        setSaving(true);
        setError('');
        try {
            const response = await fetchHonorAdmin(`${HONOR_ADMIN_API_BASE}/drafts/${encodeURIComponent(nextDraft.draftId)}/publish`, Client4.getOptions({method: 'POST'}));
            if (!response.ok) {
                throw new Error(await readErrorMessage(response));
            }
            await refreshKind(nextDraft.kind);
            await refreshDrafts();
            if (session?.canAudit) {
                setAudits(await loadAudits());
            }
            setActiveTab(nextDraft.kind);
        } catch (publishError) {
            setError(publishError instanceof Error ? publishError.message : '发布草稿失败。');
        } finally {
            setSaving(false);
        }
    }, [loadAudits, refreshDrafts, refreshKind, saving, session?.canAudit]);

    const confirmDraftDelete = useCallback(async () => {
        if (!draftDeleteTarget || saving) {
            return;
        }
        setSaving(true);
        setError('');
        try {
            const response = await fetchHonorAdmin(`${HONOR_ADMIN_API_BASE}/drafts/${encodeURIComponent(draftDeleteTarget.draftId)}`, Client4.getOptions({method: 'DELETE'}));
            if (!response.ok) {
                throw new Error(await readErrorMessage(response));
            }
            await refreshDrafts();
            if (session?.canAudit) {
                setAudits(await loadAudits());
            }
            setDraftDeleteTarget(null);
            if (editingDraftId === draftDeleteTarget.draftId) {
                closeEditor();
            }
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : '删除草稿失败。');
        } finally {
            setSaving(false);
        }
    }, [closeEditor, draftDeleteTarget, editingDraftId, loadAudits, refreshDrafts, saving, session?.canAudit]);

    const reorderItems = useCallback(async (kind: HonorKind, ids: string[]) => {
        if (saving) {
            return;
        }
        const previousItems = itemsByKind[kind];
        const nextItems = ids.map((id) => previousItems.find((item) => item.id === id)).filter(Boolean) as HonorAdminItem[];
        if (nextItems.length !== previousItems.length) {
            return;
        }

        setSaving(true);
        setError('');
        setItemsByKind((previous) => ({...previous, [kind]: nextItems}));
        try {
            const response = await fetchHonorAdmin(`${HONOR_ADMIN_API_BASE}/items/${kind}/order`, Client4.getOptions({
                method: 'PUT',
                body: JSON.stringify({ids}),
            }));
            if (!response.ok) {
                throw new Error(await readErrorMessage(response));
            }
            const body = await response.json() as {items: HonorAdminItem[]};
            setItemsByKind((previous) => ({...previous, [kind]: body.items}));
            if (session?.canAudit) {
                setAudits(await loadAudits());
            }
        } catch (reorderError) {
            setItemsByKind((previous) => ({...previous, [kind]: previousItems}));
            setError(reorderError instanceof Error ? reorderError.message : '更新展示顺序失败。');
        } finally {
            setSaving(false);
        }
    }, [itemsByKind, loadAudits, saving, session?.canAudit]);

    const canShowAudit = Boolean(session?.canAudit);
    let activePanel = (
        <ResourcePanel
            kind={activeTab as HonorKind}
            items={activeItems}
            saving={saving}
            sampleAvatarUrl={sampleAvatarUrl}
            onCreate={startCreate}
            onEdit={startEdit}
            onDelete={(kind, item) => setDeleteTarget({kind, item})}
            onReorder={reorderItems}
        />
    );
    if (activeTab === 'audit') {
        activePanel = <AuditPanel audits={audits}/>;
    } else if (activeTab === 'drafts') {
        activePanel = (
            <DraftPanel
                drafts={drafts}
                saving={saving}
                sampleAvatarUrl={sampleAvatarUrl}
                onEdit={startEditDraft}
                onPublish={publishDraft}
                onDelete={setDraftDeleteTarget}
            />
        );
    }

    if (loading) {
        return (
            <main
                className='iuin-honors-admin'
                data-route={routePathname}
            >
                <div className='wrapper--fixed iuin-honors-admin__shell'>
                    <AdminHeader>
                        <span>{'荣誉管理台'}</span>
                    </AdminHeader>
                    <div className='admin-console__wrapper iuin-honors-admin__wrapper'>
                        <div className='iuin-honors-admin__loading'>
                            <i className='icon icon-loading icon-spin'/>
                            <span>{'Loading'}</span>
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    if (!session && sessionError) {
        return (
            <main
                className='iuin-honors-admin'
                data-route={routePathname}
            >
                <div className='wrapper--fixed iuin-honors-admin__shell'>
                    <AdminHeader>
                        <span>{'荣誉管理台'}</span>
                    </AdminHeader>
                    <div className='admin-console__wrapper iuin-honors-admin__wrapper'>
                        <section className='iuin-honors-admin__empty-state'>
                            <i className='icon icon-lock-outline'/>
                            <h1>{'荣誉管理台'}</h1>
                            <p>{sessionError}</p>
                        </section>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main
            className='iuin-honors-admin'
            data-route={routePathname}
        >
            <div className='wrapper--fixed iuin-honors-admin__shell'>
                <AdminHeader>
                    <div className='iuin-honors-admin__header-title'>
                        <span>{'荣誉管理台'}</span>
                        <small>{session?.username}</small>
                    </div>
                </AdminHeader>
                <div className='admin-console__wrapper iuin-honors-admin__wrapper'>
                    <div className='iuin-honors-admin__layout'>
                        <aside className='iuin-honors-admin__sidebar'>
                            <div className='iuin-honors-admin__nav-heading'>{'管理内容'}</div>
                            <nav className='iuin-honors-admin__nav'>
                                {HONOR_TABS.map((tab) => (
                                    <button
                                        key={tab.id}
                                        type='button'
                                        className={activeTab === tab.id ? 'iuin-honors-admin__nav-item iuin-honors-admin__nav-item--active' : 'iuin-honors-admin__nav-item'}
                                        title={tab.label}
                                        onClick={() => setActiveTab(tab.id)}
                                    >
                                        <i className={`icon ${tab.icon}`}/>
                                        <span>{tab.label}</span>
                                        <strong>{itemsByKind[tab.id].length}</strong>
                                    </button>
                                ))}
                                <button
                                    type='button'
                                    className={activeTab === 'drafts' ? 'iuin-honors-admin__nav-item iuin-honors-admin__nav-item--active' : 'iuin-honors-admin__nav-item'}
                                    title='我的草稿'
                                    onClick={() => setActiveTab('drafts')}
                                >
                                    <i className='icon icon-file-document-edit-outline'/>
                                    <span>{'我的草稿'}</span>
                                    <strong>{drafts.length}</strong>
                                </button>
                                {canShowAudit && (
                                    <button
                                        type='button'
                                        className={activeTab === 'audit' ? 'iuin-honors-admin__nav-item iuin-honors-admin__nav-item--active' : 'iuin-honors-admin__nav-item'}
                                        title='审计'
                                        onClick={() => setActiveTab('audit')}
                                    >
                                        <i className='icon icon-clipboard-text-clock-outline'/>
                                        <span>{'审计'}</span>
                                        <strong>{audits.length}</strong>
                                    </button>
                                )}
                            </nav>
                        </aside>
                        <section className='admin-console__content iuin-honors-admin__content'>
                            {error && (
                                <div className='iuin-honors-admin__notice'>
                                    <i className='icon icon-alert-outline'/>
                                    <span>{error}</span>
                                </div>
                            )}
                            {activePanel}
                        </section>
                    </div>
                </div>
            </div>
            {editorOpen && (
                <HonorEditor
                    kind={editingKind}
                    draft={draft}
                    assetDraft={assetDraft}
                    saving={saving}
                    editing={editingOriginalId !== ''}
                    editingDraft={editingDraftId !== ''}
                    sampleAvatarUrl={sampleAvatarUrl}
                    onFieldChange={handleFieldChange}
                    onAssetPick={openAssetPicker}
                    onAssetDraftChange={setAssetDraft}
                    onClose={closeEditor}
                    onSaveDraft={storeEditorDraft}
                    onSubmit={publishEditor}
                />
            )}
            <input
                ref={fileInputRef}
                className='iuin-honors-admin__file-input'
                type='file'
                accept='image/png,image/jpeg,image/webp,image/gif'
                onChange={handleAssetPick}
            />
            {deleteTarget && (
                <ConfirmDeleteDialog
                    target={deleteTarget}
                    saving={saving}
                    onCancel={() => setDeleteTarget(null)}
                    onConfirm={confirmDelete}
                />
            )}
            {draftDeleteTarget && (
                <ConfirmDraftDeleteDialog
                    draft={draftDeleteTarget}
                    saving={saving}
                    onCancel={() => setDraftDeleteTarget(null)}
                    onConfirm={confirmDraftDelete}
                />
            )}
        </main>
    );
}

function ResourcePanel({
    kind,
    items,
    saving,
    sampleAvatarUrl,
    onCreate,
    onEdit,
    onDelete,
    onReorder,
}: {
    kind: HonorKind;
    items: HonorAdminItem[];
    saving: boolean;
    sampleAvatarUrl: string;
    onCreate: (kind: HonorKind) => void;
    onEdit: (kind: HonorKind, item: HonorAdminItem) => void;
    onDelete: (kind: HonorKind, item: HonorAdminItem) => void;
    onReorder: (kind: HonorKind, ids: string[]) => void;
}) {
    const panelCopy = RESOURCE_PANEL_COPY[kind];
    const [draggingItemId, setDraggingItemId] = useState('');
    const [dropTargetId, setDropTargetId] = useState('');

    const handleDragStart = useCallback((event: DragEvent<HTMLButtonElement>, itemID: string) => {
        if (saving) {
            event.preventDefault();
            return;
        }
        setDraggingItemId(itemID);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', itemID);
    }, [saving]);

    const handleDragOver = useCallback((event: DragEvent<HTMLElement>, itemID: string) => {
        if (!draggingItemId || draggingItemId === itemID) {
            return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDropTargetId(itemID);
    }, [draggingItemId]);

    const handleDrop = useCallback((event: DragEvent<HTMLElement>, targetID: string) => {
        event.preventDefault();
        const sourceID = draggingItemId || event.dataTransfer.getData('text/plain');
        setDraggingItemId('');
        setDropTargetId('');
        if (!sourceID || sourceID === targetID) {
            return;
        }
        const nextIDs = moveHonorAdminID(items.map((item) => item.id), sourceID, targetID);
        if (nextIDs.length === items.length) {
            onReorder(kind, nextIDs);
        }
    }, [draggingItemId, items, kind, onReorder]);

    const handleDragEnd = useCallback(() => {
        setDraggingItemId('');
        setDropTargetId('');
    }, []);

    return (
        <AdminPanel
            id={`IuinHonorsAdmin-${kind}`}
            className='iuin-honors-admin-panel'
            title={panelCopy.title}
            subtitle={panelCopy.subtitle}
            button={(
                <button
                    type='button'
                    className='btn btn-primary iuin-honors-admin__panel-button'
                    onClick={() => onCreate(kind)}
                >
                    <i className='icon icon-plus'/>
                    <span>{'新增'}</span>
                </button>
            )}
        >
            <div className='AdminPanel__content iuin-honors-admin-table-wrap'>
                <div className='iuin-honors-admin-table'>
                    <div className='iuin-honors-admin-table__header'>
                        <span>{'顺序'}</span>
                        <span>{kindLabel(kind)}</span>
                        <span>{'解锁条件'}</span>
                        <span>{'贡献者'}</span>
                        <span>{'ID'}</span>
                        <span>{'操作'}</span>
                    </div>
                    <div className='iuin-honors-admin-table__body'>
                        {items.map((item) => (
                            <HonorCard
                                key={item.id}
                                kind={kind}
                                item={item}
                                saving={saving}
                                sampleAvatarUrl={sampleAvatarUrl}
                                dragging={draggingItemId === item.id}
                                dropTarget={dropTargetId === item.id}
                                onDragStart={handleDragStart}
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                                onDragEnd={handleDragEnd}
                                onEdit={onEdit}
                                onDelete={onDelete}
                            />
                        ))}
                        {items.length === 0 && (
                            <div className='iuin-honors-admin__empty-state'>
                                <i className='icon icon-folder-outline'/>
                                <h3>{'暂无资源'}</h3>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AdminPanel>
    );
}

function HonorCard({
    kind,
    item,
    saving,
    sampleAvatarUrl,
    dragging,
    dropTarget,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onEdit,
    onDelete,
}: {
    kind: HonorKind;
    item: HonorAdminItem;
    saving: boolean;
    sampleAvatarUrl: string;
    dragging: boolean;
    dropTarget: boolean;
    onDragStart: (event: DragEvent<HTMLButtonElement>, itemID: string) => void;
    onDragOver: (event: DragEvent<HTMLElement>, itemID: string) => void;
    onDrop: (event: DragEvent<HTMLElement>, itemID: string) => void;
    onDragEnd: () => void;
    onEdit: (kind: HonorKind, item: HonorAdminItem) => void;
    onDelete: (kind: HonorKind, item: HonorAdminItem) => void;
}) {
    const rowClassName = [
        'iuin-honors-admin-row',
        dragging ? 'iuin-honors-admin-row--dragging' : '',
        dropTarget ? 'iuin-honors-admin-row--drop-target' : '',
    ].filter(Boolean).join(' ');
    return (
        <article
            className={rowClassName}
            onDragOver={(event) => onDragOver(event, item.id)}
            onDrop={(event) => onDrop(event, item.id)}
        >
            <div className='iuin-honors-admin-row__order'>
                <button
                    type='button'
                    className='btn btn-icon btn-tertiary iuin-honors-admin-row__drag-handle'
                    title='拖动调整展示顺序'
                    disabled={saving}
                    draggable={!saving}
                    onDragStart={(event) => onDragStart(event, item.id)}
                    onDragEnd={onDragEnd}
                >
                    <i className='icon icon-dots-vertical'/>
                </button>
            </div>
            <div className='iuin-honors-admin-row__resource'>
                <HonorPreview
                    kind={kind}
                    item={item}
                    sampleAvatarUrl={sampleAvatarUrl}
                />
                <div className='iuin-honors-admin-row__summary'>
                    <div className='iuin-honors-admin-row__title'>
                        <h3>{item.name}</h3>
                        <IuinHonorRarityTag rarity={item.rarity}/>
                    </div>
                    <p>{item.description}</p>
                </div>
            </div>
            <div className='iuin-honors-admin-row__unlock'>
                <i className='icon icon-lock-open-outline'/>
                <span>{item.unlockHint}</span>
            </div>
            <div className='iuin-honors-admin-row__contributor'>
                <i className='icon icon-account-outline'/>
                <span>{item.contributorUsername || '未记录'}</span>
            </div>
            <code className='iuin-honors-admin-row__id'>{item.id}</code>
            <div className='iuin-honors-admin-row__actions'>
                <button
                    type='button'
                    className='btn btn-icon btn-tertiary'
                    title='修改'
                    onClick={() => onEdit(kind, item)}
                >
                    <i className='icon icon-pencil-outline'/>
                </button>
                <button
                    type='button'
                    className='btn btn-icon btn-tertiary'
                    title='删除'
                    onClick={() => onDelete(kind, item)}
                >
                    <i className='icon icon-trash-can-outline'/>
                </button>
            </div>
        </article>
    );
}

function HonorPreview({kind, item, sampleAvatarUrl}: {kind: HonorKind; item: HonorAdminItem; sampleAvatarUrl: string}) {
    const assetKey = kind === 'avatar_frames' ? item.frameStorageKey || item.previewStorageKey : item.iconStorageKey;
    const assetUrl = getIuinHonorAssetUrl(assetKey);
    if (kind === 'avatar_frames') {
        return (
            <div className='iuin-honors-admin-preview iuin-honors-admin-preview--frame'>
                <span className='iuin-honors-admin-preview__avatar'>
                    {sampleAvatarUrl && (
                        <img
                            className='iuin-honors-admin-preview__avatar-image'
                            src={sampleAvatarUrl}
                            alt=''
                            draggable={false}
                            onError={(event) => {
                                event.currentTarget.style.display = 'none';
                            }}
                        />
                    )}
                </span>
                {assetUrl && (
                    <img
                        className='iuin-honors-admin-preview__frame-image'
                        src={assetUrl}
                        alt=''
                    />
                )}
            </div>
        );
    }

    return (
        <div className={`iuin-honors-admin-preview iuin-honors-admin-preview--${kind === 'titles' ? 'title' : 'achievement'}`}>
            {assetUrl ? (
                <img
                    src={assetUrl}
                    alt=''
                />
            ) : (
                <i className='icon icon-image-outline'/>
            )}
        </div>
    );
}

function DraftPanel({
    drafts,
    saving,
    sampleAvatarUrl,
    onEdit,
    onPublish,
    onDelete,
}: {
    drafts: HonorAdminDraft[];
    saving: boolean;
    sampleAvatarUrl: string;
    onEdit: (draft: HonorAdminDraft) => void;
    onPublish: (draft: HonorAdminDraft) => void;
    onDelete: (draft: HonorAdminDraft) => void;
}) {
    return (
        <AdminPanel
            id='IuinHonorsAdmin-Drafts'
            className='iuin-honors-admin-panel'
            title={DRAFT_PANEL_COPY.title}
            subtitle={DRAFT_PANEL_COPY.subtitle}
        >
            <div className='AdminPanel__content iuin-honors-admin-drafts'>
                <div className='iuin-honors-admin-drafts__header'>
                    <span>{'草稿'}</span>
                    <span>{'类型'}</span>
                    <span>{'更新时间'}</span>
                    <span>{'操作'}</span>
                </div>
                {drafts.map((draft) => (
                    <article
                        key={draft.draftId}
                        className='iuin-honors-admin-draft-row'
                    >
                        <div className='iuin-honors-admin-draft-row__resource'>
                            <HonorPreview
                                kind={draft.kind}
                                item={draft.item}
                                sampleAvatarUrl={sampleAvatarUrl}
                            />
                            <div className='iuin-honors-admin-row__summary'>
                                <div className='iuin-honors-admin-row__title'>
                                    <h3>{draft.item.name || '未命名草稿'}</h3>
                                    <IuinHonorRarityTag rarity={draft.item.rarity}/>
                                </div>
                                <p>{draft.item.description || '尚未填写介绍。'}</p>
                                <code>{draft.item.id}</code>
                            </div>
                        </div>
                        <span>{kindLabel(draft.kind)}</span>
                        <span>{formatAuditTime(draft.updateAt)}</span>
                        <div className='iuin-honors-admin-row__actions'>
                            <button
                                type='button'
                                className='btn btn-icon btn-tertiary'
                                title='编辑草稿'
                                disabled={saving}
                                onClick={() => onEdit(draft)}
                            >
                                <i className='icon icon-pencil-outline'/>
                            </button>
                            <button
                                type='button'
                                className='btn btn-icon btn-tertiary'
                                title='发布'
                                disabled={saving}
                                onClick={() => onPublish(draft)}
                            >
                                <i className='icon icon-send-outline'/>
                            </button>
                            <button
                                type='button'
                                className='btn btn-icon btn-tertiary'
                                title='删除草稿'
                                disabled={saving}
                                onClick={() => onDelete(draft)}
                            >
                                <i className='icon icon-trash-can-outline'/>
                            </button>
                        </div>
                    </article>
                ))}
                {drafts.length === 0 && (
                    <div className='iuin-honors-admin__empty-state'>
                        <i className='icon icon-file-document-edit-outline'/>
                        <h3>{'暂无草稿'}</h3>
                    </div>
                )}
            </div>
        </AdminPanel>
    );
}

function HonorEditor({
    kind,
    draft,
    assetDraft,
    saving,
    editing,
    editingDraft,
    sampleAvatarUrl,
    onFieldChange,
    onAssetPick,
    onAssetDraftChange,
    onClose,
    onSaveDraft,
    onSubmit,
}: {
    kind: HonorKind;
    draft: HonorAdminItem;
    assetDraft: AssetDraft | null;
    saving: boolean;
    editing: boolean;
    editingDraft: boolean;
    sampleAvatarUrl: string;
    onFieldChange: (field: keyof HonorAdminItem, value: string | number) => void;
    onAssetPick: () => void;
    onAssetDraftChange: (draft: AssetDraft | null) => void;
    onClose: () => void;
    onSaveDraft: () => void;
    onSubmit: (event: FormEvent) => void;
}) {
    const existingAssetKey = kind === 'avatar_frames' ? draft.frameStorageKey || draft.previewStorageKey : draft.iconStorageKey;
    let editorTitle = '新增资源';
    if (editing) {
        editorTitle = '修改资源';
    } else if (editingDraft) {
        editorTitle = '编辑草稿';
    }
    let submitLabel = editing ? '保存' : '发布';
    if (saving) {
        submitLabel = '保存中';
    }
    let assetEditor = (
        <HonorImageAdjuster
            draft={assetDraft}
            existingAssetKey={existingAssetKey}
            onChange={onAssetDraftChange}
            variant='title'
        />
    );
    if (kind === 'avatar_frames') {
        assetEditor = (
            <FrameAdjuster
                draft={assetDraft}
                existingAssetKey={existingAssetKey}
                sampleAvatarUrl={sampleAvatarUrl}
                onChange={onAssetDraftChange}
            />
        );
    } else if (kind === 'achievements') {
        assetEditor = (
            <HonorImageAdjuster
                draft={assetDraft}
                existingAssetKey={existingAssetKey}
                onChange={onAssetDraftChange}
                variant='achievement'
            />
        );
    }

    return (
        <div className='iuin-honors-admin-editor__backdrop'>
            <form
                className='iuin-honors-admin-editor'
                onSubmit={onSubmit}
            >
                <header className='iuin-honors-admin-editor__header'>
                    <div>
                        <span className='iuin-honors-admin__eyebrow'>{kindLabel(kind)}</span>
                        <h2>{editorTitle}</h2>
                    </div>
                    <button
                        type='button'
                        title='关闭'
                        disabled={saving}
                        onClick={onClose}
                    >
                        <i className='icon icon-close'/>
                    </button>
                </header>
                <div className='iuin-honors-admin-editor__body'>
                    <label>
                        <span>{'ID'}</span>
                        <input
                            value={draft.id}
                            maxLength={64}
                            disabled={saving}
                            onChange={(event) => onFieldChange('id', event.target.value)}
                        />
                    </label>
                    <label>
                        <span>{'名字'}</span>
                        <input
                            value={draft.name}
                            disabled={saving}
                            onChange={(event) => onFieldChange('name', event.target.value)}
                        />
                    </label>
                    <label>
                        <span>{'介绍'}</span>
                        <textarea
                            value={draft.description}
                            disabled={saving}
                            onChange={(event) => onFieldChange('description', event.target.value)}
                        />
                    </label>
                    <label>
                        <span>{'解锁条件'}</span>
                        <textarea
                            value={draft.unlockHint}
                            disabled={saving}
                            onChange={(event) => onFieldChange('unlockHint', event.target.value)}
                        />
                    </label>
                    <label>
                        <span>{'稀有度'}</span>
                        <select
                            value={draft.rarity}
                            disabled={saving}
                            onChange={(event) => onFieldChange('rarity', event.target.value)}
                        >
                            {IUIN_HONOR_RARITIES.map((rarity) => (
                                <option
                                    key={rarity}
                                    value={rarity}
                                >
                                    {rarity}
                                </option>
                            ))}
                        </select>
                        <div className='iuin-honors-admin-editor__rarity-preview'>
                            <IuinHonorRarityTag rarity={draft.rarity}/>
                        </div>
                    </label>
                    {kind === 'achievements' && (
                        <label>
                            <span>{'分类'}</span>
                            <input
                                value={draft.category}
                                disabled={saving}
                                onChange={(event) => onFieldChange('category', event.target.value)}
                            />
                        </label>
                    )}
                    <section className='iuin-honors-admin-editor__asset'>
                        <div className='iuin-honors-admin-editor__asset-head'>
                            <span>{kind === 'avatar_frames' ? '头像框素材' : '图片素材'}</span>
                            <button
                                type='button'
                                disabled={saving}
                                onClick={onAssetPick}
                            >
                                <i className='icon icon-upload-outline'/>
                                <span>{assetDraft || existingAssetKey ? '重新上传' : '上传'}</span>
                            </button>
                        </div>
                        {assetEditor}
                    </section>
                </div>
                <footer className='iuin-honors-admin-editor__actions'>
                    <button
                        type='button'
                        disabled={saving}
                        onClick={onClose}
                    >
                        {'取消'}
                    </button>
                    {!editing && (
                        <button
                            type='button'
                            disabled={saving}
                            onClick={onSaveDraft}
                        >
                            {saving ? '保存中' : '存草稿'}
                        </button>
                    )}
                    <button
                        type='submit'
                        disabled={saving}
                    >
                        {submitLabel}
                    </button>
                </footer>
            </form>
        </div>
    );
}

function HonorImageAdjuster({
    draft,
    existingAssetKey,
    onChange,
    variant,
}: {
    draft: AssetDraft | null;
    existingAssetKey: string;
    onChange: (draft: AssetDraft | null) => void;
    variant: 'achievement' | 'title';
}) {
    const [dragState, setDragState] = useState<DragState | null>(null);
    const existingUrl = getIuinHonorAssetUrl(existingAssetKey);
    const src = draft?.url || existingUrl;
    const canvasWidth = variant === 'title' ? TITLE_IMAGE_CANVAS_WIDTH : HONOR_IMAGE_CANVAS_SIZE;
    const canvasHeight = variant === 'title' ? TITLE_IMAGE_CANVAS_HEIGHT : HONOR_IMAGE_CANVAS_SIZE;
    const scaleMin = 0.2;
    const scaleMax = 1.8;
    const showCropGuide = variant === 'achievement';
    const drawBox = useMemo(() => (draft ? getHonorImageDrawBox(draft, canvasWidth, canvasHeight) : null), [canvasHeight, canvasWidth, draft]);
    const imageStyle = drawBox ? {
        width: `${(drawBox.width / canvasWidth) * 100}%`,
        height: `${(drawBox.height / canvasHeight) * 100}%`,
        left: `${(drawBox.x / canvasWidth) * 100}%`,
        top: `${(drawBox.y / canvasHeight) * 100}%`,
    } : {
        width: '100%',
        height: '100%',
        left: 0,
        top: 0,
        objectFit: 'contain' as const,
    };

    const handleImageLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
        if (!draft) {
            return;
        }
        const image = event.currentTarget;
        if (draft.naturalWidth === image.naturalWidth && draft.naturalHeight === image.naturalHeight) {
            return;
        }
        onChange({
            ...draft,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
        });
    }, [draft, onChange]);

    const updateDraft = useCallback((patch: Partial<AssetDraft>) => {
        if (!draft) {
            return;
        }
        onChange({...draft, ...patch});
    }, [draft, onChange]);

    const startDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (!draft) {
            return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragState({
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            baseX: draft.offsetX,
            baseY: draft.offsetY,
        });
    }, [draft]);

    const moveDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (!draft || !dragState || dragState.pointerId !== event.pointerId) {
            return;
        }
        const stageRect = event.currentTarget.getBoundingClientRect();
        const scaleX = stageRect.width ? canvasWidth / stageRect.width : HONOR_IMAGE_CANVAS_SIZE / HONOR_IMAGE_PREVIEW_SIZE;
        const scaleY = stageRect.height ? canvasHeight / stageRect.height : HONOR_IMAGE_CANVAS_SIZE / HONOR_IMAGE_PREVIEW_SIZE;
        updateDraft({
            offsetX: dragState.baseX + ((event.clientX - dragState.startX) * scaleX),
            offsetY: dragState.baseY + ((event.clientY - dragState.startY) * scaleY),
        });
    }, [canvasHeight, canvasWidth, draft, dragState, updateDraft]);

    const stopDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (!dragState || dragState.pointerId !== event.pointerId) {
            return;
        }
        setDragState(null);
    }, [dragState]);

    let stageContent: React.ReactNode = null;
    if (src) {
        stageContent = (
            <img
                className='iuin-honors-admin-image-adjuster__image'
                src={src}
                alt=''
                draggable={false}
                style={imageStyle}
                onLoad={handleImageLoad}
            />
        );
    } else if (showCropGuide) {
        stageContent = <i className='icon icon-image-outline'/>;
    }

    return (
        <div className={`iuin-honors-admin-image-adjuster iuin-honors-admin-image-adjuster--${variant}`}>
            <div
                className={`iuin-honors-admin-image-adjuster__stage${dragState ? ' iuin-honors-admin-image-adjuster__stage--dragging' : ''}`}
                style={{aspectRatio: `${canvasWidth} / ${canvasHeight}`}}
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={stopDrag}
                onPointerCancel={stopDrag}
            >
                {stageContent}
                {showCropGuide && (
                    <span
                        className='iuin-honors-admin-image-adjuster__crop-guide'
                        aria-hidden={true}
                    />
                )}
            </div>
            {draft && (
                <div className='iuin-honors-admin-frame-adjuster__controls'>
                    <label>
                        <span>{'缩放'}</span>
                        <input
                            type='range'
                            min={String(scaleMin)}
                            max={String(scaleMax)}
                            step='0.01'
                            value={draft.scale}
                            onChange={(event) => updateDraft({scale: Number(event.target.value)})}
                        />
                    </label>
                    <label>
                        <span>{'X'}</span>
                        <input
                            type='range'
                            min={String(-Math.round(canvasWidth / 2))}
                            max={String(Math.round(canvasWidth / 2))}
                            step='1'
                            value={draft.offsetX}
                            onChange={(event) => updateDraft({offsetX: Number(event.target.value)})}
                        />
                    </label>
                    <label>
                        <span>{'Y'}</span>
                        <input
                            type='range'
                            min={String(-Math.round(canvasHeight / 2))}
                            max={String(Math.round(canvasHeight / 2))}
                            step='1'
                            value={draft.offsetY}
                            onChange={(event) => updateDraft({offsetY: Number(event.target.value)})}
                        />
                    </label>
                </div>
            )}
        </div>
    );
}

function FrameAdjuster({
    draft,
    existingAssetKey,
    sampleAvatarUrl,
    onChange,
}: {
    draft: AssetDraft | null;
    existingAssetKey: string;
    sampleAvatarUrl: string;
    onChange: (draft: AssetDraft | null) => void;
}) {
    const [dragState, setDragState] = useState<DragState | null>(null);
    const previewRef = useRef<HTMLDivElement>(null);
    const existingUrl = getIuinHonorAssetUrl(existingAssetKey);
    const src = draft?.url || existingUrl;
    const frameBox = useMemo(() => (draft ? getFrameDrawBox(draft) : null), [draft]);

    const handleImageLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
        if (!draft) {
            return;
        }
        const image = event.currentTarget;
        if (draft.naturalWidth === image.naturalWidth && draft.naturalHeight === image.naturalHeight) {
            return;
        }
        onChange({
            ...draft,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
        });
    }, [draft, onChange]);

    const updateDraft = useCallback((patch: Partial<AssetDraft>) => {
        if (!draft) {
            return;
        }
        onChange({...draft, ...patch});
    }, [draft, onChange]);

    const startDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (!draft) {
            return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragState({
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            baseX: draft.offsetX,
            baseY: draft.offsetY,
        });
    }, [draft]);

    const moveDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (!draft || !dragState || dragState.pointerId !== event.pointerId) {
            return;
        }
        const scale = FRAME_CANVAS_SIZE / FRAME_PREVIEW_SIZE;
        updateDraft({
            offsetX: dragState.baseX + ((event.clientX - dragState.startX) * scale),
            offsetY: dragState.baseY + ((event.clientY - dragState.startY) * scale),
        });
    }, [draft, dragState, updateDraft]);

    const stopDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (!dragState || dragState.pointerId !== event.pointerId) {
            return;
        }
        setDragState(null);
    }, [dragState]);

    return (
        <div className='iuin-honors-admin-frame-adjuster'>
            <div
                ref={previewRef}
                className={`iuin-honors-admin-frame-adjuster__stage${dragState ? ' iuin-honors-admin-frame-adjuster__stage--dragging' : ''}`}
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={stopDrag}
                onPointerCancel={stopDrag}
            >
                <span className='iuin-honors-admin-frame-adjuster__sample-avatar'>
                    {sampleAvatarUrl && (
                        <img
                            className='iuin-honors-admin-frame-adjuster__sample-avatar-image'
                            src={sampleAvatarUrl}
                            alt=''
                            draggable={false}
                            onError={(event) => {
                                event.currentTarget.style.display = 'none';
                            }}
                        />
                    )}
                </span>
                {src ? (
                    <img
                        className='iuin-honors-admin-frame-adjuster__frame-image'
                        src={src}
                        alt=''
                        draggable={false}
                        style={frameBox ? {
                            width: `${(frameBox.width / FRAME_CANVAS_SIZE) * 100}%`,
                            height: `${(frameBox.height / FRAME_CANVAS_SIZE) * 100}%`,
                            left: `${(frameBox.x / FRAME_CANVAS_SIZE) * 100}%`,
                            top: `${(frameBox.y / FRAME_CANVAS_SIZE) * 100}%`,
                        } : undefined}
                        onLoad={handleImageLoad}
                    />
                ) : (
                    <i className='icon icon-image-outline'/>
                )}
            </div>
            {draft && (
                <div className='iuin-honors-admin-frame-adjuster__controls'>
                    <label>
                        <span>{'缩放'}</span>
                        <input
                            type='range'
                            min='0.5'
                            max='2.4'
                            step='0.01'
                            value={draft.scale}
                            onChange={(event) => updateDraft({scale: Number(event.target.value)})}
                        />
                    </label>
                    <label>
                        <span>{'X'}</span>
                        <input
                            type='range'
                            min='-220'
                            max='220'
                            step='1'
                            value={draft.offsetX}
                            onChange={(event) => updateDraft({offsetX: Number(event.target.value)})}
                        />
                    </label>
                    <label>
                        <span>{'Y'}</span>
                        <input
                            type='range'
                            min='-220'
                            max='220'
                            step='1'
                            value={draft.offsetY}
                            onChange={(event) => updateDraft({offsetY: Number(event.target.value)})}
                        />
                    </label>
                </div>
            )}
        </div>
    );
}

function AuditPanel({audits}: {audits: HonorAdminAudit[]}) {
    return (
        <AdminPanel
            id='IuinHonorsAdmin-Audit'
            className='iuin-honors-admin-panel'
            title={AUDIT_PANEL_COPY.title}
            subtitle={AUDIT_PANEL_COPY.subtitle}
        >
            <div className='AdminPanel__content iuin-honors-admin-audit'>
                <div className='iuin-honors-admin-audit__header'>
                    <span>{'用户'}</span>
                    <span>{'目标'}</span>
                    <span>{'摘要'}</span>
                </div>
                {audits.map((audit) => (
                    <article
                        key={audit.id}
                        className='iuin-honors-admin-audit__row'
                    >
                        <div>
                            <strong>{audit.actorUsername}</strong>
                            <span>{formatAuditTime(audit.createAt)}</span>
                        </div>
                        <div>
                            <span className={`iuin-honors-admin-audit__action iuin-honors-admin-audit__action--${audit.action}`}>{audit.action}</span>
                            <code>{`${audit.targetType}/${audit.targetId}`}</code>
                        </div>
                        <p>{audit.summary}</p>
                        {(audit.beforePayload || audit.afterPayload) && (
                            <details>
                                <summary>{'Payload'}</summary>
                                <pre>{formatAuditPayload(audit)}</pre>
                            </details>
                        )}
                    </article>
                ))}
                {audits.length === 0 && (
                    <div className='iuin-honors-admin__empty-state'>
                        <i className='icon icon-clipboard-text-outline'/>
                        <h3>{'暂无记录'}</h3>
                    </div>
                )}
            </div>
        </AdminPanel>
    );
}

function ConfirmDeleteDialog({
    target,
    saving,
    onCancel,
    onConfirm,
}: {
    target: {kind: HonorKind; item: HonorAdminItem};
    saving: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <div className='iuin-honors-admin-confirm__backdrop'>
            <section className='iuin-honors-admin-confirm'>
                <header>
                    <i className='icon icon-trash-can-outline'/>
                    <h2>{'删除资源'}</h2>
                </header>
                <p>{`确认删除「${target.item.name}」？`}</p>
                <footer>
                    <button
                        type='button'
                        disabled={saving}
                        onClick={onCancel}
                    >
                        {'取消'}
                    </button>
                    <button
                        type='button'
                        disabled={saving}
                        onClick={onConfirm}
                    >
                        {saving ? '删除中' : '删除'}
                    </button>
                </footer>
            </section>
        </div>
    );
}

function ConfirmDraftDeleteDialog({
    draft,
    saving,
    onCancel,
    onConfirm,
}: {
    draft: HonorAdminDraft;
    saving: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <div className='iuin-honors-admin-confirm__backdrop'>
            <section className='iuin-honors-admin-confirm'>
                <header>
                    <i className='icon icon-trash-can-outline'/>
                    <h2>{'删除草稿'}</h2>
                </header>
                <p>{`确认删除「${draft.item.name || draft.item.id || '未命名草稿'}」？`}</p>
                <footer>
                    <button
                        type='button'
                        disabled={saving}
                        onClick={onCancel}
                    >
                        {'取消'}
                    </button>
                    <button
                        type='button'
                        disabled={saving}
                        onClick={onConfirm}
                    >
                        {saving ? '删除中' : '删除'}
                    </button>
                </footer>
            </section>
        </div>
    );
}

async function uploadAssetForDraft(kind: HonorKind, itemId: string, draft: AssetDraft): Promise<string> {
    const form = new FormData();
    form.append('kind', kind);
    form.append('item_id', itemId);
    if (kind === 'avatar_frames') {
        form.append('role', 'frame');
        const box = getFrameDrawBox(draft);
        form.append('output_size', String(FRAME_CANVAS_SIZE));
        form.append('frame_x', String(box.x));
        form.append('frame_y', String(box.y));
        form.append('frame_width', String(box.width));
        form.append('frame_height', String(box.height));
        if (draft.file.type === 'image/gif') {
            form.append('image', draft.file);
        } else {
            form.append('image', await getCroppedFrameFile(draft));
        }
    } else {
        const canvasWidth = kind === 'titles' ? TITLE_IMAGE_CANVAS_WIDTH : HONOR_IMAGE_CANVAS_SIZE;
        const canvasHeight = kind === 'titles' ? TITLE_IMAGE_CANVAS_HEIGHT : HONOR_IMAGE_CANVAS_SIZE;
        form.append('role', kind === 'titles' ? 'title' : 'icon');
        const measuredDraft = await measureAssetDraft(draft);
        const isAnimatedImage = draft.file.type === 'image/gif';
        const uploadFile = isAnimatedImage ? draft.file : await getCroppedHonorImageFile(measuredDraft, canvasWidth, canvasHeight);
        const box = isAnimatedImage ? getHonorImageDrawBox(measuredDraft, canvasWidth, canvasHeight) : {
            x: 0,
            y: 0,
            width: canvasWidth,
            height: canvasHeight,
        };
        form.append('output_width', String(canvasWidth));
        form.append('output_height', String(canvasHeight));
        form.append('image_x', String(box.x));
        form.append('image_y', String(box.y));
        form.append('image_width', String(box.width));
        form.append('image_height', String(box.height));
        form.append('image', uploadFile);
    }

    const response = await fetchHonorAdmin(`${HONOR_ADMIN_API_BASE}/assets`, Client4.getOptions({
        method: 'POST',
        body: form,
    }));
    if (!response.ok) {
        throw new Error(await readErrorMessage(response));
    }
    const body = await response.json() as {storageKey: string};
    return body.storageKey;
}

async function measureAssetDraft(draft: AssetDraft): Promise<AssetDraft> {
    if (draft.naturalWidth > 0 && draft.naturalHeight > 0) {
        return draft;
    }
    const image = await loadImage(draft.url);
    return {
        ...draft,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
    };
}

async function fetchHonorAdmin(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), HONOR_ADMIN_REQUEST_TIMEOUT);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error('请求超时，请刷新页面或确认服务仍在运行。');
        }
        throw error;
    } finally {
        window.clearTimeout(timeout);
    }
}

async function getCroppedFrameFile(draft: AssetDraft): Promise<File> {
    const image = await loadImage(draft.url);
    const canvas = document.createElement('canvas');
    canvas.width = FRAME_CANVAS_SIZE;
    canvas.height = FRAME_CANVAS_SIZE;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('无法裁剪头像框。');
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const box = getFrameDrawBox({
        ...draft,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
    });
    context.clearRect(0, 0, FRAME_CANVAS_SIZE, FRAME_CANVAS_SIZE);
    context.drawImage(image, box.x, box.y, box.width, box.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((nextBlob) => {
            if (nextBlob) {
                resolve(nextBlob);
                return;
            }
            reject(new Error('无法裁剪头像框。'));
        }, 'image/png');
    });
    return new File([blob], `${draft.file.name.replace(/\.[^.]+$/, '') || 'avatar-frame'}.png`, {type: 'image/png'});
}

async function getCroppedHonorImageFile(draft: AssetDraft, canvasWidth: number, canvasHeight: number): Promise<File> {
    const image = await loadImage(draft.url);
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('无法裁剪图片素材。');
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const box = getHonorImageDrawBox({
        ...draft,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
    }, canvasWidth, canvasHeight);
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.drawImage(image, box.x, box.y, box.width, box.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((nextBlob) => {
            if (nextBlob) {
                resolve(nextBlob);
                return;
            }
            reject(new Error('无法裁剪图片素材。'));
        }, 'image/png');
    });
    return new File([blob], `${draft.file.name.replace(/\.[^.]+$/, '') || 'honor-image'}.png`, {type: 'image/png'});
}

function getFrameDrawBox(draft: AssetDraft): {x: number; y: number; width: number; height: number} {
    const naturalWidth = draft.naturalWidth || FRAME_CANVAS_SIZE;
    const naturalHeight = draft.naturalHeight || FRAME_CANVAS_SIZE;
    const baseScale = FRAME_CANVAS_SIZE / Math.max(naturalWidth, naturalHeight);
    const width = naturalWidth * baseScale * draft.scale;
    const height = naturalHeight * baseScale * draft.scale;
    return {
        x: ((FRAME_CANVAS_SIZE - width) / 2) + draft.offsetX,
        y: ((FRAME_CANVAS_SIZE - height) / 2) + draft.offsetY,
        width,
        height,
    };
}

function getHonorImageDrawBox(draft: AssetDraft, canvasWidth = HONOR_IMAGE_CANVAS_SIZE, canvasHeight = HONOR_IMAGE_CANVAS_SIZE): {x: number; y: number; width: number; height: number} {
    const naturalWidth = draft.naturalWidth || canvasWidth;
    const naturalHeight = draft.naturalHeight || canvasHeight;
    const baseScale = Math.max(canvasWidth / naturalWidth, canvasHeight / naturalHeight);
    const width = naturalWidth * baseScale * draft.scale;
    const height = naturalHeight * baseScale * draft.scale;
    const maxOffsetX = canvasWidth / 2;
    const maxOffsetY = canvasHeight / 2;
    const offsetX = Math.min(Math.max(draft.offsetX, -maxOffsetX), maxOffsetX);
    const offsetY = Math.min(Math.max(draft.offsetY, -maxOffsetY), maxOffsetY);

    return {
        x: ((canvasWidth - width) / 2) + offsetX,
        y: ((canvasHeight - height) / 2) + offsetY,
        width,
        height,
    };
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('无法读取图片。'));
        image.src = src;
    });
}

function isSupportedHonorAsset(file: File): boolean {
    return ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type);
}

async function readErrorMessage(response: Response): Promise<string> {
    try {
        const body = await response.json() as {message?: string; detailed_error?: string};
        if (body.detailed_error && (!body.message || body.message.startsWith('api.'))) {
            return body.detailed_error;
        }
        return body.message || body.detailed_error || response.statusText || '请求失败。';
    } catch {
        return response.statusText || '请求失败。';
    }
}

function nextSortOrder(items: HonorAdminItem[]): number {
    if (items.length === 0) {
        return 10;
    }
    return Math.max(...items.map((item) => item.sortOrder || 0)) + 10;
}

function moveHonorAdminID(ids: string[], sourceID: string, targetID: string): string[] {
    const sourceIndex = ids.indexOf(sourceID);
    const targetIndex = ids.indexOf(targetID);
    if (sourceIndex < 0 || targetIndex < 0) {
        return ids;
    }

    const nextIDs = [...ids];
    const [source] = nextIDs.splice(sourceIndex, 1);
    const insertionIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    nextIDs.splice(insertionIndex, 0, source);
    return nextIDs;
}

function generateHonorAdminId(kind: HonorKind): string {
    let prefix = 'achievement';
    if (kind === 'avatar_frames') {
        prefix = 'frame';
    } else if (kind === 'titles') {
        prefix = 'title';
    }
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${timestamp}_${random}`.slice(0, 64);
}

function isValidHonorAdminId(value: string): boolean {
    return (/^[A-Za-z0-9_-]{1,64}$/).test(value);
}

function hasHonorAsset(kind: HonorKind, item: HonorAdminItem): boolean {
    if (kind === 'avatar_frames') {
        return Boolean(item.frameStorageKey || item.previewStorageKey);
    }
    return Boolean(item.iconStorageKey);
}

function kindLabel(kind: HonorKind): string {
    switch (kind) {
    case 'avatar_frames':
        return '头像框';
    case 'titles':
        return '称号';
    case 'achievements':
        return '成就';
    default:
        return '资源';
    }
}

function formatAuditTime(value: number): string {
    if (!value) {
        return '';
    }
    return new Date(value).toLocaleString();
}

function formatAuditPayload(audit: HonorAdminAudit): string {
    const before = parseAuditJSON(audit.beforePayload);
    const after = parseAuditJSON(audit.afterPayload);
    return JSON.stringify({before, after}, null, 2);
}

function parseAuditJSON(value: string): unknown {
    if (!value) {
        return null;
    }
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}
