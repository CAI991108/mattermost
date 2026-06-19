// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ChangeEvent, Dispatch, KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, SetStateAction} from 'react';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {FormattedMessage, useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import type {RouteComponentProps} from 'react-router-dom';
import {Redirect} from 'react-router-dom';

import type {Session} from '@mattermost/types/sessions';
import type {UserProfile} from '@mattermost/types/users';

import {getUserByUsername as fetchUserByUsername, revokeSession, updateMe, updateUserPassword} from 'mattermost-redux/actions/users';
import {Client4} from 'mattermost-redux/client';
import {getPasswordConfig} from 'mattermost-redux/selectors/entities/general';
import {getCurrentUser, getUserByUsername as selectUserByUsername} from 'mattermost-redux/selectors/entities/users';

import ExternalLink from 'components/external_link';

import {getHistory} from 'utils/browser_history';
import {isValidPassword} from 'utils/password';

import type {GlobalState} from 'types/store';

import HtmlCodeEditor from './html_code_editor';
import {
    appendHtmlModule,
    getDisplayName,
    getIuinProfileData,
    getProfilePatch,
    getReadmeFileContent,
    getReadmeRootName,
    IUIN_README_MAIN_FILE,
    type IuinAcademicEntry,
    type IuinProfileData,
    type IuinReadmeFile,
    type IuinReadmeWorkspace,
    parseIuinAcademicEntries,
    parseIuinReadmeWorkspace,
    removeReadmeFile,
    renderIuinReadmeMarkdown,
    sanitizeIuinProfileHtml,
    serializeIuinAcademicEntries,
    serializeIuinReadmeWorkspace,
    setReadmeFileContent,
    splitProfileList,
} from './profile_data';
import {useIuinJoinedTeamLabels} from './use_joined_channels';

import './iuin_profile.scss';

type RouteParams = {
    username: string;
};

type Props = RouteComponentProps<RouteParams>;

type EditorTab = 'preview' | 'code';
type EditorSection = 'homepage' | 'advanced' | 'account' | 'security';
type AcademicSectionId = 'experience' | 'education' | 'papers' | 'awards';
type HomepageSectionId = 'researchFields' | 'summary' | AcademicSectionId;
type SectionVisibility = Record<HomepageSectionId, boolean>;

type AccountDraft = {
    username: string;
    firstName: string;
    lastName: string;
    nickname: string;
    position: string;
    email: string;
    locale: string;
    currentPassword: string;
};

type PasswordDraft = {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
};

type PasswordMessage = {
    type: 'error' | 'success';
    text: string;
};

type AcademicSectionConfig = {
    id: AcademicSectionId;
    icon: string;
    className: string;
    titleId: string;
    defaultTitle: string;
    descriptionId: string;
    defaultDescription: string;
    emptyId: string;
    defaultEmpty: string;
    titleLabelId: string;
    defaultTitleLabel: string;
    subtitleLabelId: string;
    defaultSubtitleLabel: string;
    metaLabelId: string;
    defaultMetaLabel: string;
    detailLabelId: string;
    defaultDetailLabel: string;
    titlePlaceholder: string;
    subtitlePlaceholder: string;
    metaPlaceholder: string;
    detailPlaceholder: string;
};

type AcademicEntryDialogState = {
    sectionId: AcademicSectionId;
    index: number | null;
    draft: IuinAcademicEntry;
};

type VisualWidgetDialogType = 'skill-icons' | 'shields-badge';

type VisualDragState = {
    widgetId: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
};

type VisualDeleteAnchor = {
    widgetId: string;
    left: number;
    top: number;
};

type VisualElementRect = {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
};

type SkillIconOption = {
    id: string;
    label: string;
};

type SkillWidgetDraft = {
    selectedIds: string[];
    customIconDataUrl: string;
    customIconName: string;
};

type ContactBadgeOption = {
    id: string;
    label: string;
    logo: string;
    color: string;
    defaultValue: string;
    placeholder: string;
};

type BadgeWidgetDraft = {
    platformId: string;
    value: string;
    customIconDataUrl: string;
    customIconName: string;
};

type IuinProfileSettingsResponse = {
    user: UserProfile;
    security: {
        auth_service: string;
        mfa_active: boolean;
        sessions_count: number;
        other_sessions_count: number;
        current_session_id: string;
        can_change_password: boolean;
        can_use_mfa: boolean;
    };
};

type GitHubRepositoryReference = {
    owner: string;
    repo: string;
    ref?: string;
    path?: string;
};

type GitHubRepositoryMetadata = {
    default_branch?: string;
};

type GitHubContentsEntry = {
    name: string;
    path: string;
    type: string;
    size?: number;
    download_url?: string | null;
    content?: string;
    encoding?: string;
};

type GitHubReadmeReference = {
    source: string;
    repoPath: string;
    workspacePath: string;
};

type GitHubReadmeImport = {
    rootName: string;
    files: IuinReadmeFile[];
    githubRenderedHtml: string;
    supportingFileCount: number;
};

type ReadmeFileTreeNode = {
    name: string;
    path: string;
    type: 'folder' | 'file';
    children: ReadmeFileTreeNode[];
    file?: IuinReadmeFile;
};

const ACCOUNT_LOCALES = [{
    value: '',
    id: 'iuin_profile.account.locale_default',
    defaultMessage: 'Use system default',
}, {
    value: 'zh-CN',
    id: 'iuin_profile.account.locale_zh_cn',
    defaultMessage: '简体中文',
}, {
    value: 'zh-TW',
    id: 'iuin_profile.account.locale_zh_tw',
    defaultMessage: '繁體中文',
}, {
    value: 'en',
    id: 'iuin_profile.account.locale_en',
    defaultMessage: 'English',
}];

const MAX_STATUS_MEDIA_SIZE = 2 * 1024 * 1024;
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_IMPORT_SUPPORT_FILE_LIMIT = 28;
const GITHUB_IMPORT_TEXT_SIZE_LIMIT = 512 * 1024;
const GITHUB_README_FILE_PATTERN = /^readme(?:\.(md|markdown|txt|rst))?$/i;
const GITHUB_TEXT_FILE_PATTERN = /\.(md|markdown|txt|rst)$/i;
const GITHUB_ASSET_FILE_PATTERN = /\.(png|jpe?g|gif|webp|svg)$/i;
const GITHUB_IMPORTABLE_FILE_PATTERN = /\.(md|markdown|txt|rst|png|jpe?g|gif|webp|svg)$/i;

const VISUAL_WIDGET_START_LEFT = 24;
const VISUAL_WIDGET_START_TOP = 24;
const VISUAL_WIDGET_GRID_SIZE = 24;
const VISUAL_WIDGET_ALIGN_RANGE = 10;
const VISUAL_DELETE_HANDLE_OFFSET = 2;
const VISUAL_FLOW_BLOCK_GAP = 14;
const VISUAL_FLOW_BLOCK_COLLISION_RANGE = 6;
const VISUAL_PREVIEW_MIN_HEIGHT = 394;

const SKILL_ICON_OPTIONS: SkillIconOption[] = [
    {id: 'py', label: 'Python'},
    {id: 'pytorch', label: 'PyTorch'},
    {id: 'tensorflow', label: 'TensorFlow'},
    {id: 'sklearn', label: 'Scikit-learn'},
    {id: 'react', label: 'React'},
    {id: 'vue', label: 'Vue'},
    {id: 'ts', label: 'TypeScript'},
    {id: 'js', label: 'JavaScript'},
    {id: 'latex', label: 'LaTeX'},
    {id: 'r', label: 'R'},
    {id: 'matlab', label: 'MATLAB'},
    {id: 'docker', label: 'Docker'},
    {id: 'linux', label: 'Linux'},
    {id: 'ubuntu', label: 'Ubuntu'},
    {id: 'git', label: 'Git'},
    {id: 'github', label: 'GitHub'},
    {id: 'anaconda', label: 'Anaconda'},
    {id: 'vim', label: 'Vim'},
];

const DEFAULT_SKILL_ICON_IDS = ['py', 'pytorch', 'tensorflow', 'react', 'latex'];

const CONTACT_BADGE_OPTIONS: ContactBadgeOption[] = [{
    id: 'github',
    label: 'GitHub',
    logo: 'github',
    color: 'blue',
    defaultValue: '',
    placeholder: 'litangchao',
}, {
    id: 'wechat',
    label: 'WeChat',
    logo: 'wechat',
    color: '07C160',
    defaultValue: '',
    placeholder: 'wechat_id',
}, {
    id: 'facebook',
    label: 'Facebook',
    logo: 'facebook',
    color: '1877F2',
    defaultValue: '',
    placeholder: 'facebook_id',
}, {
    id: 'linkedin',
    label: 'LinkedIn',
    logo: 'linkedin',
    color: '0A66C2',
    defaultValue: '',
    placeholder: 'profile',
}, {
    id: 'email',
    label: 'Email',
    logo: 'gmail',
    color: 'EA4335',
    defaultValue: '',
    placeholder: 'name@example.com',
}, {
    id: 'huggingface',
    label: 'HuggingFace',
    logo: 'huggingface',
    color: 'FFD21E',
    defaultValue: '',
    placeholder: 'username',
}];

const HOMEPAGE_SECTION_IDS: HomepageSectionId[] = ['researchFields', 'summary', 'experience', 'education', 'papers', 'awards'];

const DEFAULT_SECTION_VISIBILITY: SectionVisibility = {
    researchFields: true,
    summary: true,
    experience: true,
    education: true,
    papers: true,
    awards: true,
};

const ACADEMIC_SECTION_CONFIGS: AcademicSectionConfig[] = [{
    id: 'experience',
    icon: 'icon-account-outline',
    className: 'iuin-profile-timeline-section--experience',
    titleId: 'iuin_profile.experience',
    defaultTitle: 'Experience',
    descriptionId: 'iuin_profile.editor.experience_hint_long',
    defaultDescription: 'Positions, roles, and project work shown after your summary.',
    emptyId: 'iuin_profile.experience_empty',
    defaultEmpty: 'No experience entries yet.',
    titleLabelId: 'iuin_profile.editor.experience_title_label',
    defaultTitleLabel: 'Role or title',
    subtitleLabelId: 'iuin_profile.editor.experience_subtitle_label',
    defaultSubtitleLabel: 'Organization',
    metaLabelId: 'iuin_profile.editor.experience_meta_label',
    defaultMetaLabel: 'Date range',
    detailLabelId: 'iuin_profile.editor.experience_detail_label',
    defaultDetailLabel: 'Description',
    titlePlaceholder: 'Director of Cloud Infrastructure',
    subtitlePlaceholder: 'GenCoin',
    metaPlaceholder: 'January 2021 - Present',
    detailPlaceholder: 'Led cloud architecture and research platform operations.',
}, {
    id: 'education',
    icon: 'icon-book-outline',
    className: 'iuin-profile-timeline-section--education',
    titleId: 'iuin_profile.education',
    defaultTitle: 'Education',
    descriptionId: 'iuin_profile.editor.education_hint_long',
    defaultDescription: 'Degrees, schools, thesis work, and academic background.',
    emptyId: 'iuin_profile.education_empty',
    defaultEmpty: 'No education entries yet.',
    titleLabelId: 'iuin_profile.editor.education_title_label',
    defaultTitleLabel: 'Degree',
    subtitleLabelId: 'iuin_profile.editor.education_subtitle_label',
    defaultSubtitleLabel: 'Institution',
    metaLabelId: 'iuin_profile.editor.education_meta_label',
    defaultMetaLabel: 'Date range',
    detailLabelId: 'iuin_profile.editor.education_detail_label',
    defaultDetailLabel: 'Description',
    titlePlaceholder: 'PhD Artificial Intelligence',
    subtitlePlaceholder: 'Stanford University',
    metaPlaceholder: 'January 2016 - December 2020',
    detailPlaceholder: 'Thesis on trustworthy multimodal intelligence.',
}, {
    id: 'papers',
    icon: 'icon-file-text-outline',
    className: 'iuin-profile-timeline-section--papers',
    titleId: 'iuin_profile.papers',
    defaultTitle: 'Paper',
    descriptionId: 'iuin_profile.editor.papers_hint_long',
    defaultDescription: 'Representative publications, venues, authorship notes, and links.',
    emptyId: 'iuin_profile.papers_empty',
    defaultEmpty: 'No paper entries yet.',
    titleLabelId: 'iuin_profile.editor.papers_title_label',
    defaultTitleLabel: 'Paper title',
    subtitleLabelId: 'iuin_profile.editor.papers_subtitle_label',
    defaultSubtitleLabel: 'Venue or authors',
    metaLabelId: 'iuin_profile.editor.papers_meta_label',
    defaultMetaLabel: 'Note',
    detailLabelId: 'iuin_profile.editor.papers_detail_label',
    defaultDetailLabel: 'URL or detail',
    titlePlaceholder: 'Graph Reasoning for Collaborative Intelligence',
    subtitlePlaceholder: 'ICML 2024',
    metaPlaceholder: 'Best paper finalist',
    detailPlaceholder: 'https://example.com/paper',
}, {
    id: 'awards',
    icon: 'icon-crown-outline',
    className: 'iuin-profile-timeline-section--awards',
    titleId: 'iuin_profile.awards',
    defaultTitle: 'Awards',
    descriptionId: 'iuin_profile.editor.awards_hint_long',
    defaultDescription: 'Honors, grants, recognitions, and award history.',
    emptyId: 'iuin_profile.awards_empty',
    defaultEmpty: 'No award entries yet.',
    titleLabelId: 'iuin_profile.editor.awards_title_label',
    defaultTitleLabel: 'Award',
    subtitleLabelId: 'iuin_profile.editor.awards_subtitle_label',
    defaultSubtitleLabel: 'Issuer',
    metaLabelId: 'iuin_profile.editor.awards_meta_label',
    defaultMetaLabel: 'Year',
    detailLabelId: 'iuin_profile.editor.awards_detail_label',
    defaultDetailLabel: 'Description',
    titlePlaceholder: 'Outstanding Research Award',
    subtitlePlaceholder: 'School of Artificial Intelligence',
    metaPlaceholder: '2025',
    detailPlaceholder: 'Recognized for research contributions.',
}];

function getEmptyAcademicEntry(): IuinAcademicEntry {
    return {
        title: '',
        subtitle: '',
        meta: '',
        link: '',
    };
}

function parseSectionVisibility(value: string): SectionVisibility {
    const visibility = {...DEFAULT_SECTION_VISIBILITY};

    if (!value.trim()) {
        return visibility;
    }

    try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object') {
            return visibility;
        }

        HOMEPAGE_SECTION_IDS.forEach((sectionId) => {
            const nextValue = (parsed as Partial<Record<HomepageSectionId, unknown>>)[sectionId];
            if (typeof nextValue === 'boolean') {
                visibility[sectionId] = nextValue;
            }
        });
    } catch {
        return visibility;
    }

    return visibility;
}

function serializeSectionVisibility(visibility: SectionVisibility): string {
    return JSON.stringify(visibility);
}

function getAccountDraft(user: UserProfile): AccountDraft {
    return {
        username: user.username || '',
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        nickname: user.nickname || '',
        position: user.position || '',
        email: user.email || '',
        locale: user.locale || '',
        currentPassword: '',
    };
}

function getEmptyPasswordDraft(): PasswordDraft {
    return {
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    };
}

async function fetchIuinProfileSettings(): Promise<IuinProfileSettingsResponse> {
    const response = await fetch(`${Client4.getUserRoute('me')}/iuin_profile/settings`, Client4.getOptions({method: 'GET'}));
    if (!response.ok) {
        let message = response.statusText;
        try {
            const body = await response.json();
            message = body.message || message;
        } catch {
            // Keep the HTTP status text when the server does not return JSON.
        }

        throw new Error(message);
    }

    return response.json();
}

function getSessionDeviceLabel(session: Session): string {
    const browser = session.props?.browser;
    const os = session.props?.os;

    return [browser, os].filter(Boolean).join(' / ') || session.device_id || session.id;
}

function getAuthServiceLabel(authService: string): string {
    switch (authService) {
    case 'gitlab':
        return 'GitLab';
    case 'ldap':
        return 'AD/LDAP';
    case 'saml':
        return 'SAML';
    case 'google':
        return 'Google';
    case 'office365':
        return 'Microsoft 365';
    case 'openid':
        return 'OpenID';
    case 'magic_link':
        return 'Magic link';
    default:
        return 'Email and password';
    }
}

function getEditorSectionFromLocation(location: Props['location']): EditorSection {
    if (location.pathname.endsWith('/edit/readme')) {
        return 'advanced';
    }

    const section = new URLSearchParams(location.search).get('section');
    if (section === 'advanced' || section === 'account' || section === 'security') {
        return section;
    }

    return 'homepage';
}

function getEditorSectionUrl(username: string, section: EditorSection) {
    if (section === 'homepage') {
        return `/u/${username}/edit`;
    }

    return `/u/${username}/edit?section=${section}`;
}

function getEditorSectionEyebrow(section: EditorSection) {
    switch (section) {
    case 'advanced':
        return (
            <FormattedMessage
                id='iuin_profile.readme.eyebrow'
                defaultMessage='README workspace'
            />
        );
    case 'account':
        return (
            <FormattedMessage
                id='iuin_profile.account.eyebrow'
                defaultMessage='Account preferences'
            />
        );
    case 'security':
        return (
            <FormattedMessage
                id='iuin_profile.security.eyebrow'
                defaultMessage='Sign-in and sessions'
            />
        );
    default:
        return (
            <FormattedMessage
                id='iuin_profile.editor.eyebrow'
                defaultMessage='Academic CV profile'
            />
        );
    }
}

function getEditorSectionTitle(section: EditorSection) {
    switch (section) {
    case 'advanced':
        return (
            <FormattedMessage
                id='iuin_profile.readme.advanced_settings'
                defaultMessage='Advanced settings'
            />
        );
    case 'account':
        return (
            <FormattedMessage
                id='iuin_profile.account.title'
                defaultMessage='Account settings'
            />
        );
    case 'security':
        return (
            <FormattedMessage
                id='iuin_profile.security.title'
                defaultMessage='Security settings'
            />
        );
    default:
        return (
            <FormattedMessage
                id='iuin_profile.editor.title'
                defaultMessage='Edit your research homepage'
            />
        );
    }
}

function getProfileSaveMessage(saving: boolean) {
    if (saving) {
        return (
            <FormattedMessage
                id='iuin_profile.editor.saving'
                defaultMessage='Saving...'
            />
        );
    }

    return (
        <FormattedMessage
            id='iuin_profile.editor.save'
            defaultMessage='Save homepage'
        />
    );
}

export default function IuinProfilePage({match, location}: Props) {
    const dispatch = useDispatch();
    const username = match.params.username;
    const isReadmeAdvanced = location.pathname.endsWith('/edit/readme');
    const isEditing = location.pathname.endsWith('/edit') || isReadmeAdvanced;
    const editorSection = getEditorSectionFromLocation(location);
    const currentUser = useSelector(getCurrentUser);
    const profileUser = useSelector((state: GlobalState) => selectUserByUsername(state, username));

    useEffect(() => {
        if (!profileUser && username) {
            dispatch(fetchUserByUsername(username) as any);
        }
    }, [dispatch, profileUser, username]);

    if (!profileUser) {
        return (
            <main className='iuin-profile-page iuin-profile-page--loading'>
                <FormattedMessage
                    id='iuin_profile.loading'
                    defaultMessage='Loading profile...'
                />
            </main>
        );
    }

    const canEdit = currentUser?.id === profileUser.id;

    if (isEditing && !canEdit) {
        return <Redirect to={`/u/${profileUser.username}`}/>;
    }

    if (isEditing && currentUser) {
        return (
            <IuinProfileEditor
                currentUser={currentUser}
                initialSection={editorSection}
            />
        );
    }

    return (
        <IuinProfileOverview
            user={profileUser}
            canEdit={canEdit}
        />
    );
}

function IuinProfileOverview({user, canEdit}: {user: UserProfile; canEdit: boolean}) {
    const currentUser = useSelector(getCurrentUser);
    const profile = getIuinProfileData(user);
    const displayName = getDisplayName(user);
    const fields = splitProfileList(profile.researchFields);
    const experienceEntries = useMemo(() => parseIuinAcademicEntries(profile.experience), [profile.experience]);
    const educationEntries = useMemo(() => parseIuinAcademicEntries(profile.education), [profile.education]);
    const paperEntries = useMemo(() => parseIuinAcademicEntries(profile.papers), [profile.papers]);
    const awardEntries = useMemo(() => parseIuinAcademicEntries(profile.awards), [profile.awards]);
    const sectionVisibility = useMemo(() => parseSectionVisibility(profile.sectionVisibility), [profile.sectionVisibility]);
    const joinedTeams = useIuinJoinedTeamLabels(user.id, Boolean(currentUser?.id));
    const avatarUrl = Client4.getProfilePictureUrl(user.id, user.last_picture_update);
    const profileInitials = getProfileInitials(displayName, user.username);
    const readmeWorkspace = useMemo(() => parseIuinReadmeWorkspace(profile.readmeWorkspace, profile.homepageHtml, getReadmeRootName(user)), [profile.homepageHtml, profile.readmeWorkspace, user]);
    const [overviewGithubRenderedHtml, setOverviewGithubRenderedHtml] = useState('');
    const renderedReadmeWorkspace = useMemo(() => overviewGithubRenderedHtml && !readmeWorkspace.githubRenderedHtml ? {
        ...readmeWorkspace,
        githubRenderedHtml: overviewGithubRenderedHtml,
    } : readmeWorkspace, [overviewGithubRenderedHtml, readmeWorkspace]);
    const readmeContent = useMemo(() => getReadmeFileContent(renderedReadmeWorkspace, IUIN_README_MAIN_FILE), [renderedReadmeWorkspace]);
    const readmeHtml = useMemo(() => renderReadmeWorkspacePreview(readmeContent, renderedReadmeWorkspace), [readmeContent, renderedReadmeWorkspace]);
    const joinedAt = new Intl.DateTimeFormat(undefined, {
        month: 'short',
        year: 'numeric',
    }).format(new Date(user.create_at || Date.now()));

    useEffect(() => {
        setOverviewGithubRenderedHtml('');

        if (readmeWorkspace.githubRenderedHtml) {
            return undefined;
        }

        const repository = getSameNameProfileRepositoryFromRootName(readmeWorkspace.rootName);
        if (!repository) {
            return undefined;
        }

        let cancelled = false;
        const hydrateOverviewPreview = async () => {
            try {
                const metadata = await fetchGitHubJson<GitHubRepositoryMetadata>(`${GITHUB_API_BASE}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`);
                const renderedHtml = await tryFetchGitHubRenderedReadmeHtml(repository.owner, repository.repo, IUIN_README_MAIN_FILE, metadata.default_branch || 'main');
                if (!cancelled && renderedHtml) {
                    setOverviewGithubRenderedHtml(renderedHtml);
                }
            } catch {
                // Keep the local Markdown preview when GitHub's rendered README endpoint is unavailable.
            }
        };

        hydrateOverviewPreview();

        return () => {
            cancelled = true;
        };
    }, [readmeWorkspace.githubRenderedHtml, readmeWorkspace.rootName]);

    return (
        <main className='iuin-profile-shell iuin-profile-display'>
            <div className='iuin-profile-shell__layout'>
                <aside className='iuin-profile-academic-sidebar iuin-profile-hui-card iuin-profile-hui-card--profile'>
                    <div className='iuin-profile-hui-avatar iuin-profile-hui-avatar--xl'>
                        <span
                            className='iuin-profile-hui-avatar__fallback'
                            aria-hidden='true'
                        >
                            {profileInitials}
                        </span>
                        <img
                            className='iuin-profile-academic-sidebar__avatar iuin-profile-hui-avatar__image'
                            src={avatarUrl}
                            alt={displayName}
                            onError={(event) => {
                                event.currentTarget.style.display = 'none';
                            }}
                        />
                    </div>
                    <div className='iuin-profile-academic-sidebar__identity'>
                        <h1>{displayName}</h1>
                        <div className='iuin-profile-academic-sidebar__username'>{`@${user.username}`}</div>
                        {user.position && (
                            <p className='iuin-profile-academic-sidebar__position'>
                                {user.position}
                            </p>
                        )}
                    </div>
                    {(profile.researchStatus || profile.statusMedia) && (
                        <section className='iuin-profile-academic-sidebar__module iuin-profile-academic-sidebar__module--status'>
                            {profile.statusMedia && (
                                <img
                                    className='iuin-profile-academic-sidebar__status-badge'
                                    src={profile.statusMedia}
                                    alt=''
                                />
                            )}
                            {profile.researchStatus && (
                                <p>{profile.researchStatus}</p>
                            )}
                        </section>
                    )}
                    {sectionVisibility.researchFields && (
                        <section className='iuin-profile-academic-sidebar__module'>
                            <h2>
                                <FormattedMessage
                                    id='iuin_profile.editor.fields'
                                    defaultMessage='Research fields'
                                />
                            </h2>
                            {fields.length > 0 ? (
                                <div className='iuin-profile-academic-sidebar__chips'>
                                    {fields.map((field) => (
                                        <span
                                            key={field}
                                            className='iuin-profile-hui-chip iuin-profile-hui-chip--accent iuin-profile-hui-chip--soft'
                                        >
                                            {field}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className='iuin-profile-academic-sidebar__empty'>
                                    <FormattedMessage
                                        id='iuin_profile.fields_empty'
                                        defaultMessage='No research fields yet.'
                                    />
                                </p>
                            )}
                        </section>
                    )}
                    <section
                        id='iuin-profile-joined-teams'
                        className='iuin-profile-academic-sidebar__module'
                    >
                        <h2>
                            <FormattedMessage
                                id='iuin_profile.joined_teams'
                                defaultMessage='Joined teams'
                            />
                        </h2>
                        {joinedTeams.length > 0 ? (
                            <div className='iuin-profile-academic-sidebar__team-cards'>
                                {joinedTeams.map((team) => (
                                    <span
                                        key={team}
                                        className='iuin-profile-hui-chip iuin-profile-hui-chip--success iuin-profile-hui-chip--secondary'
                                    >
                                        {team}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className='iuin-profile-academic-sidebar__empty'>
                                <FormattedMessage
                                    id='iuin_profile.teams_empty'
                                    defaultMessage='No teams yet.'
                                />
                            </p>
                        )}
                    </section>
                    {canEdit && (
                        <button
                            type='button'
                            className='iuin-profile-button iuin-profile-button--full iuin-profile-hui-button iuin-profile-hui-button--secondary'
                            onClick={() => getHistory().push(`/u/${user.username}/edit`)}
                        >
                            <span>
                                <FormattedMessage
                                    id='iuin_profile.edit_homepage'
                                    defaultMessage='Edit profile'
                                />
                            </span>
                        </button>
                    )}
                    <ul
                        id='iuin-profile-joined-meta'
                        className='iuin-profile-academic-sidebar__meta'
                    >
                        {user.email && (
                            <li>
                                <i className='icon icon-email-outline'/>
                                <a href={`mailto:${user.email}`}>{user.email}</a>
                            </li>
                        )}
                        <li>
                            <i className='icon icon-calendar-outline'/>
                            <FormattedMessage
                                id='iuin_profile.joined'
                                defaultMessage='Joined {date}'
                                values={{date: joinedAt}}
                            />
                        </li>
                    </ul>
                </aside>
                <section className='iuin-profile-academic-main'>
                    {sectionVisibility.summary && readmeHtml.trim() && (
                        <section className='iuin-profile-acv-summary iuin-profile-hui-card iuin-profile-hui-card--summary'>
                            <div className='iuin-profile-readme-card-title'>
                                <span>{`${user.username} / README.md`}</span>
                            </div>
                            <div className='iuin-profile-homepage-card__body iuin-profile-hui-card__content iuin-readme-workbench__preview-canvas iuin-profile-readme-home-preview'>
                                <article
                                    className='iuin-profile-rendered iuin-readme-workbench__preview-body'
                                    dangerouslySetInnerHTML={{__html: readmeHtml}}
                                />
                            </div>
                        </section>
                    )}
                    {sectionVisibility.experience && experienceEntries.length > 0 && (
                        <IuinTimelineSection
                            className='iuin-profile-timeline-section--experience'
                            icon='icon-account-outline'
                            entries={experienceEntries}
                            title={(
                                <FormattedMessage
                                    id='iuin_profile.experience'
                                    defaultMessage='Experience'
                                />
                            )}
                            empty={(
                                <FormattedMessage
                                    id='iuin_profile.experience_empty'
                                    defaultMessage='No experience entries yet.'
                                />
                            )}
                        />
                    )}
                    {sectionVisibility.education && educationEntries.length > 0 && (
                        <IuinTimelineSection
                            className='iuin-profile-timeline-section--education'
                            icon='icon-book-outline'
                            entries={educationEntries}
                            title={(
                                <FormattedMessage
                                    id='iuin_profile.education'
                                    defaultMessage='Education'
                                />
                            )}
                            empty={(
                                <FormattedMessage
                                    id='iuin_profile.education_empty'
                                    defaultMessage='No education entries yet.'
                                />
                            )}
                        />
                    )}
                    {sectionVisibility.papers && paperEntries.length > 0 && (
                        <IuinTimelineSection
                            className='iuin-profile-timeline-section--papers'
                            icon='icon-file-text-outline'
                            entries={paperEntries}
                            title={(
                                <FormattedMessage
                                    id='iuin_profile.papers'
                                    defaultMessage='Paper'
                                />
                            )}
                            empty={(
                                <FormattedMessage
                                    id='iuin_profile.papers_empty'
                                    defaultMessage='No paper entries yet.'
                                />
                            )}
                        />
                    )}
                    {sectionVisibility.awards && awardEntries.length > 0 && (
                        <IuinTimelineSection
                            className='iuin-profile-timeline-section--awards'
                            icon='icon-crown-outline'
                            entries={awardEntries}
                            title={(
                                <FormattedMessage
                                    id='iuin_profile.awards'
                                    defaultMessage='Awards'
                                />
                            )}
                            empty={(
                                <FormattedMessage
                                    id='iuin_profile.awards_empty'
                                    defaultMessage='No award entries yet.'
                                />
                            )}
                        />
                    )}
                </section>
            </div>
        </main>
    );
}

function IuinTimelineSection({
    className,
    icon,
    entries,
    title,
    empty,
}: {
    className: string;
    icon: string;
    entries: ReturnType<typeof parseIuinAcademicEntries>;
    title: React.ReactNode;
    empty: React.ReactNode;
}) {
    return (
        <section className={`iuin-profile-timeline-section iuin-profile-hui-section ${className}`}>
            <div className='iuin-profile-hui-section__header'>
                <h2>{title}</h2>
            </div>
            {entries.length > 0 ? (
                <div className='iuin-profile-timeline'>
                    {entries.map((entry) => {
                        const safeLink = getSafeAcademicLink(entry.link);
                        const heading = getAcademicEntryHeading(entry);
                        const entryKey = [entry.title, entry.subtitle, entry.meta, entry.link].join('-');
                        const detail = safeLink ? '' : entry.link;

                        return (
                            <article
                                key={entryKey}
                                className='iuin-profile-timeline__item iuin-profile-hui-card iuin-profile-hui-card--timeline-item'
                            >
                                <span className='iuin-profile-timeline__marker'>
                                    <i className={`icon ${icon}`}/>
                                </span>
                                <div className='iuin-profile-timeline__content iuin-profile-hui-card__content'>
                                    <div className='iuin-profile-timeline__headline'>
                                        <h3>
                                            {safeLink ? (
                                                <ExternalLink
                                                    href={safeLink}
                                                    location='iuin_profile_timeline_entry'
                                                >
                                                    {heading}
                                                </ExternalLink>
                                            ) : heading}
                                        </h3>
                                        {entry.meta && (
                                            <span>
                                                <i className='icon icon-calendar-outline'/>
                                                {entry.meta}
                                            </span>
                                        )}
                                    </div>
                                    {detail && <p>{detail}</p>}
                                </div>
                            </article>
                        );
                    })}
                </div>
            ) : (
                <p className='iuin-profile-acv-empty'>{empty}</p>
            )}
        </section>
    );
}

function getAcademicEntryHeading(entry: IuinAcademicEntry): string {
    return [entry.title, entry.subtitle].
        map((value) => value.trim()).
        filter(Boolean).
        join(' | ');
}

function IuinAcademicSectionHeading({icon, title}: {icon: string; title: React.ReactNode}) {
    return (
        <div className='iuin-profile-acv-heading iuin-profile-hui-card__header'>
            <span className='iuin-profile-acv-heading__icon'>
                <i className={`icon ${icon}`}/>
            </span>
            <h2>{title}</h2>
        </div>
    );
}

function getSafeAcademicLink(link: string): string {
    const value = link.trim();
    const normalized = value.toLowerCase();

    if (normalized.startsWith('https://') || normalized.startsWith('http://') || normalized.startsWith('/') || normalized.startsWith('#')) {
        return value;
    }

    return '';
}

function createVisualWidgetHtml(widgetType: VisualWidgetDialogType, innerHtml: string): string {
    const widgetId = `iuin-widget-${widgetType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return innerHtml.
        replace('class="iuin-visual-widget ', `data-iuin-widget="${escapeHtmlAttribute(widgetType)}" data-iuin-widget-id="${escapeHtmlAttribute(widgetId)}" style="left: ${VISUAL_WIDGET_START_LEFT}px; top: ${VISUAL_WIDGET_START_TOP}px;" class="iuin-visual-widget `);
}

function createSkillWidgetHtml(draft: SkillWidgetDraft): string {
    const pieces: string[] = [];

    if (draft.selectedIds.length > 0) {
        pieces.push(...draft.selectedIds.map((skillId) => {
            const skill = SKILL_ICON_OPTIONS.find((item) => item.id === skillId);
            const label = skill?.label || skillId;

            return [
                `<span class="iuin-visual-widget__skill-chip iuin-visual-widget__skill-chip--${escapeHtmlAttribute(skillId)}">`,
                `<span class="iuin-visual-widget__skill-mark">${escapeHtmlText(getSkillGlyph(skillId, label))}</span>`,
                `<span>${escapeHtmlText(label)}</span>`,
                '</span>',
            ].join('');
        }));
    }

    if (draft.customIconDataUrl) {
        pieces.push([
            '<span class="iuin-visual-widget__skill-chip iuin-visual-widget__skill-chip--custom">',
            `<img class="iuin-visual-widget__custom-icon" src="${escapeHtmlAttribute(draft.customIconDataUrl)}" alt="${escapeHtmlAttribute(draft.customIconName || 'Custom skill icon')}" />`,
            `<span>${escapeHtmlText(draft.customIconName || 'Custom')}</span>`,
            '</span>',
        ].join(''));
    }

    return createVisualWidgetHtml('skill-icons', `<span class="iuin-visual-widget iuin-visual-widget--component iuin-visual-widget--skills">${pieces.join('')}</span>`);
}

function createBadgeWidgetHtml(draft: BadgeWidgetDraft): string {
    const option = CONTACT_BADGE_OPTIONS.find((item) => item.id === draft.platformId) || CONTACT_BADGE_OPTIONS[0];
    const value = draft.value.trim() || option.placeholder;

    if (draft.customIconDataUrl) {
        return createVisualWidgetHtml('shields-badge', [
            '<span class="iuin-visual-widget iuin-visual-widget--contact-badge iuin-visual-widget--custom-badge">',
            `<img class="iuin-visual-widget__contact-icon" src="${escapeHtmlAttribute(draft.customIconDataUrl)}" alt="${escapeHtmlAttribute(draft.customIconName || option.label)}" />`,
            `<span>${escapeHtmlText(option.label)}</span>`,
            `<strong>${escapeHtmlText(value)}</strong>`,
            '</span>',
        ].join(''));
    }

    return createVisualWidgetHtml('shields-badge', [
        `<span class="iuin-visual-widget iuin-visual-widget--contact-badge iuin-visual-widget--${escapeHtmlAttribute(option.id)}">`,
        `<span class="iuin-visual-widget__contact-icon">${escapeHtmlText(getContactBadgeIconText(option.id))}</span>`,
        `<span>${escapeHtmlText(option.label)}</span>`,
        `<strong>${escapeHtmlText(value)}</strong>`,
        '</span>',
    ].join(''));
}

function updateVisualWidgetPosition(html: string, widgetId: string, left: number, top: number): string {
    if (typeof DOMParser === 'undefined') {
        return html;
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const widgets = Array.from(doc.body.querySelectorAll<HTMLElement>('[data-iuin-widget-id]'));
    const widget = widgets.find((element) => element.getAttribute('data-iuin-widget-id') === widgetId);

    if (!widget) {
        return html;
    }

    widget.setAttribute('style', setInlinePosition(widget.getAttribute('style') || '', left, top));

    return doc.body.innerHTML.trim();
}

function deleteVisualWidgetHtml(html: string, widgetId: string): string {
    if (typeof DOMParser === 'undefined') {
        return html;
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const widgets = Array.from(doc.body.querySelectorAll<HTMLElement>('[data-iuin-widget-id]'));
    const widget = widgets.find((element) => element.getAttribute('data-iuin-widget-id') === widgetId);

    if (!widget) {
        return html;
    }

    widget.remove();

    return doc.body.innerHTML.trim();
}

function setInlinePosition(style: string, left: number, top: number): string {
    const declarations = style.
        split(';').
        map((declaration) => declaration.trim()).
        filter((declaration) => declaration && !(/^(left|top)\s*:/i).test(declaration));

    declarations.push(`left: ${Math.round(left)}px`);
    declarations.push(`top: ${Math.round(top)}px`);

    return declarations.join('; ');
}

function clampVisualPosition(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

function getSnappedVisualPosition(
    left: number,
    top: number,
    dragState: VisualDragState,
    canvas: HTMLElement,
    snapEnabled: boolean,
): {left: number; top: number} {
    const canvasRect = canvas.getBoundingClientRect();
    const maxLeft = canvasRect.width - dragState.width;
    const maxTop = canvasRect.height - dragState.height;

    if (!snapEnabled) {
        return {
            left: clampVisualPosition(left, 0, maxLeft),
            top: clampVisualPosition(top, 0, maxTop),
        };
    }

    const horizontalTargets = [
        0,
        (canvasRect.width - dragState.width) / 2,
        maxLeft,
    ];
    const verticalTargets = [
        0,
        (canvasRect.height - dragState.height) / 2,
        maxTop,
    ];

    Array.from(canvas.querySelectorAll<HTMLElement>('[data-iuin-widget-id]')).forEach((widget) => {
        if (widget.getAttribute('data-iuin-widget-id') === dragState.widgetId) {
            return;
        }

        const widgetRect = widget.getBoundingClientRect();
        const widgetLeft = widgetRect.left - canvasRect.left;
        const widgetTop = widgetRect.top - canvasRect.top;

        horizontalTargets.push(widgetLeft);
        horizontalTargets.push(widgetLeft + (widgetRect.width - dragState.width) / 2);
        horizontalTargets.push(widgetLeft + widgetRect.width - dragState.width);
        verticalTargets.push(widgetTop);
        verticalTargets.push(widgetTop + (widgetRect.height - dragState.height) / 2);
        verticalTargets.push(widgetTop + widgetRect.height - dragState.height);
    });

    const gridLeft = Math.round(left / VISUAL_WIDGET_GRID_SIZE) * VISUAL_WIDGET_GRID_SIZE;
    const gridTop = Math.round(top / VISUAL_WIDGET_GRID_SIZE) * VISUAL_WIDGET_GRID_SIZE;

    return {
        left: clampVisualPosition(snapAxisPosition(gridLeft, left, horizontalTargets), 0, maxLeft),
        top: clampVisualPosition(snapAxisPosition(gridTop, top, verticalTargets), 0, maxTop),
    };
}

function snapAxisPosition(gridPosition: number, rawPosition: number, targets: number[]): number {
    const closestTarget = targets.reduce<{value: number; distance: number} | null>((closest, target) => {
        const distance = Math.abs(rawPosition - target);
        if (distance > VISUAL_WIDGET_ALIGN_RANGE) {
            return closest;
        }

        if (!closest || distance < closest.distance) {
            return {value: target, distance};
        }

        return closest;
    }, null);

    return closestTarget ? closestTarget.value : gridPosition;
}

function isVisualFlowBlock(element: Element): element is HTMLElement {
    if (!(element instanceof HTMLElement) || element.hasAttribute('data-iuin-widget-id')) {
        return false;
    }

    const tagName = element.tagName.toLowerCase();
    const mediaBlockTags = new Set(['img', 'video', 'iframe', 'table', 'pre']);
    return Boolean(element.textContent?.trim()) || mediaBlockTags.has(tagName);
}

function getVisualElementRect(element: HTMLElement, canvas: HTMLElement): VisualElementRect {
    const elementRect = element.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const left = elementRect.left - canvasRect.left;
    const top = elementRect.top - canvasRect.top;

    return {
        left,
        top,
        right: left + elementRect.width,
        bottom: top + elementRect.height,
        width: elementRect.width,
        height: elementRect.height,
    };
}

function visualRectsOverlap(source: VisualElementRect, target: VisualElementRect, range = 0): boolean {
    return source.left < target.right + range &&
        source.right > target.left - range &&
        source.top < target.bottom + range &&
        source.bottom > target.top - range;
}

function resetVisualFlowBlocks(canvas: HTMLElement): HTMLElement[] {
    return Array.from(canvas.children).filter(isVisualFlowBlock).map((block) => {
        block.style.removeProperty('--iuin-flow-block-push');
        block.classList.remove('iuin-profile-visual-editor__flow-block--displaced');
        block.removeAttribute('data-iuin-flow-push');
        return block;
    });
}

function syncVisualPreviewHeight(canvas: HTMLElement) {
    const canvasTop = canvas.getBoundingClientRect().top;
    const maxBottom = Array.from(canvas.children).reduce((bottom, child) => {
        if (!(child instanceof HTMLElement)) {
            return bottom;
        }

        return Math.max(bottom, child.getBoundingClientRect().bottom - canvasTop);
    }, 0);

    canvas.style.minHeight = `${Math.max(VISUAL_PREVIEW_MIN_HEIGHT, Math.ceil(maxBottom + 24))}px`;
}

function resolveVisualPreviewCollisions(stage: HTMLElement) {
    const canvas = stage.querySelector<HTMLElement>('.iuin-profile-rendered--preview');
    if (!canvas) {
        return;
    }

    const flowBlocks = resetVisualFlowBlocks(canvas);
    const widgets = Array.from(canvas.querySelectorAll<HTMLElement>('[data-iuin-widget-id]')).
        filter((widget) => widget.parentElement === canvas).
        sort((firstWidget, secondWidget) => firstWidget.getBoundingClientRect().top - secondWidget.getBoundingClientRect().top);

    if (flowBlocks.length === 0 || widgets.length === 0) {
        syncVisualPreviewHeight(canvas);
        return;
    }

    widgets.forEach((widget) => {
        const widgetRect = getVisualElementRect(widget, canvas);

        flowBlocks.forEach((block) => {
            const blockRect = getVisualElementRect(block, canvas);

            if (!visualRectsOverlap(widgetRect, blockRect, VISUAL_FLOW_BLOCK_COLLISION_RANGE)) {
                return;
            }

            const currentPush = Number(block.getAttribute('data-iuin-flow-push') || '0');
            const nextPush = Math.max(currentPush, Math.ceil(widgetRect.bottom - blockRect.top + VISUAL_FLOW_BLOCK_GAP));

            block.style.setProperty('--iuin-flow-block-push', `${nextPush}px`);
            block.setAttribute('data-iuin-flow-push', String(nextPush));
            block.classList.add('iuin-profile-visual-editor__flow-block--displaced');
        });
    });

    syncVisualPreviewHeight(canvas);
}

function escapeHtmlAttribute(value: string): string {
    return value.
        replace(/&/g, '&amp;').
        replace(/"/g, '&quot;').
        replace(/</g, '&lt;').
        replace(/>/g, '&gt;');
}

function escapeHtmlText(value: string): string {
    return value.
        replace(/&/g, '&amp;').
        replace(/</g, '&lt;').
        replace(/>/g, '&gt;');
}

function getDefaultSkillWidgetDraft(): SkillWidgetDraft {
    return {
        selectedIds: DEFAULT_SKILL_ICON_IDS,
        customIconDataUrl: '',
        customIconName: '',
    };
}

function getDefaultBadgeWidgetDraft(username: string, email: string): BadgeWidgetDraft {
    return {
        platformId: 'github',
        value: username || email || '',
        customIconDataUrl: '',
        customIconName: '',
    };
}

function isSupportedVisualUpload(file: File): boolean {
    return (/^image\/(gif|png|jpe?g|webp)$/i).test(file.type);
}

function getSkillGlyph(skillId: string, label: string): string {
    const glyphs: Record<string, string> = {
        py: 'Py',
        pytorch: 'PT',
        tensorflow: 'TF',
        sklearn: 'SK',
        react: 'R',
        vue: 'V',
        ts: 'TS',
        js: 'JS',
        latex: 'TeX',
        r: 'R',
        matlab: 'M',
        docker: 'D',
        linux: 'Li',
        ubuntu: 'Ub',
        git: 'Git',
        github: 'GH',
        anaconda: 'An',
        vim: 'Vim',
    };

    return glyphs[skillId] || label.slice(0, 2).toUpperCase();
}

function getContactBadgeIconText(platformId: string): string {
    const labels: Record<string, string> = {
        github: 'GH',
        wechat: 'WX',
        facebook: 'FB',
        linkedin: 'in',
        email: '@',
        huggingface: 'HF',
    };

    return labels[platformId] || platformId.slice(0, 2).toUpperCase();
}

function getVisualWidgetFromPointer(stage: HTMLElement, target: HTMLElement | null, clientX: number, clientY: number): HTMLElement | null {
    const directWidget = target?.closest('[data-iuin-widget-id]') as HTMLElement | null;
    if (directWidget && stage.contains(directWidget)) {
        return directWidget;
    }

    return Array.from(stage.querySelectorAll<HTMLElement>('[data-iuin-widget-id]')).find((widget) => {
        const rect = widget.getBoundingClientRect();
        const nearDeleteHandle = clientX >= rect.right - 18 && clientX <= rect.right + 22 && clientY >= rect.top - 22 && clientY <= rect.top + 18;
        const overWidget = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;

        return overWidget || nearDeleteHandle;
    }) || null;
}

function getVisualDeleteAnchor(stage: HTMLElement, widget: HTMLElement): VisualDeleteAnchor | null {
    const widgetId = widget.getAttribute('data-iuin-widget-id');
    if (!widgetId) {
        return null;
    }

    const stageRect = stage.getBoundingClientRect();
    const widgetRect = widget.getBoundingClientRect();

    return {
        widgetId,
        left: widgetRect.right - stageRect.left + VISUAL_DELETE_HANDLE_OFFSET,
        top: widgetRect.top - stageRect.top - VISUAL_DELETE_HANDLE_OFFSET,
    };
}

function getReadmeBasename(path: string): string {
    return path.split('/').filter(Boolean).pop() || path;
}

function createReadmeFolderNode(name: string, path: string): ReadmeFileTreeNode {
    return {
        name,
        path,
        type: 'folder',
        children: [],
    };
}

function createReadmeFileTree(files: IuinReadmeFile[]): ReadmeFileTreeNode[] {
    const root = createReadmeFolderNode('', '');
    const folders = new Map<string, ReadmeFileTreeNode>([['', root]]);

    const ensureFolder = (path: string): ReadmeFileTreeNode => {
        const parts = normalizeReadmeRelativePath(path).split('/').filter(Boolean);
        let parent = root;
        let currentPath = '';
        parts.forEach((part) => {
            currentPath = [currentPath, part].filter(Boolean).join('/');
            let folder = folders.get(currentPath);
            if (!folder) {
                folder = createReadmeFolderNode(part, currentPath);
                folders.set(currentPath, folder);
                parent.children.push(folder);
            }
            parent = folder;
        });

        return parent;
    };

    files.forEach((file) => {
        const path = normalizeReadmeRelativePath(file.path);
        const parts = path.split('/').filter(Boolean);
        if (parts.length === 0) {
            return;
        }

        if (file.type === 'folder') {
            ensureFolder(path);
            return;
        }

        const parent = ensureFolder(parts.slice(0, -1).join('/'));
        parent.children.push({
            name: parts[parts.length - 1],
            path,
            type: 'file',
            children: [],
            file,
        });
    });

    const sortNodes = (nodes: ReadmeFileTreeNode[]) => {
        nodes.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'folder' ? -1 : 1;
            }

            if (a.path === IUIN_README_MAIN_FILE) {
                return -1;
            }
            if (b.path === IUIN_README_MAIN_FILE) {
                return 1;
            }

            return a.name.localeCompare(b.name, undefined, {sensitivity: 'base'});
        });
        nodes.forEach((node) => sortNodes(node.children));
    };

    sortNodes(root.children);

    return root.children;
}

function getReadmeFolderPaths(files: IuinReadmeFile[]): Set<string> {
    const folders = new Set<string>();

    files.forEach((file) => {
        const path = normalizeReadmeRelativePath(file.path);
        if (!path) {
            return;
        }

        if (file.type === 'folder') {
            folders.add(path);
        }

        let directory = file.type === 'folder' ? path : getReadmeDirectory(path);
        while (directory) {
            folders.add(directory);
            directory = getReadmeDirectory(directory);
        }
    });

    return folders;
}

function getUniqueReadmePath(files: IuinReadmeFile[], preferredPath: string): string {
    const normalized = normalizeReadmeRelativePath(preferredPath);
    const existing = new Set(files.map((file) => normalizeReadmeRelativePath(file.path)));
    if (!existing.has(normalized)) {
        return normalized;
    }

    const extensionIndex = normalized.lastIndexOf('.');
    const slashIndex = normalized.lastIndexOf('/');
    const hasExtension = extensionIndex > slashIndex;
    const prefix = hasExtension ? normalized.slice(0, extensionIndex) : normalized;
    const extension = hasExtension ? normalized.slice(extensionIndex) : '';

    let index = 2;
    let candidate = `${prefix}-${index}${extension}`;
    while (existing.has(candidate)) {
        index += 1;
        candidate = `${prefix}-${index}${extension}`;
    }

    return candidate;
}

function getUniqueReadmeFolderPath(files: IuinReadmeFile[], preferredPath: string): string {
    const normalized = normalizeReadmeRelativePath(preferredPath) || 'new-folder';
    const occupied = new Set(files.map((file) => normalizeReadmeRelativePath(file.path)).filter(Boolean));
    getReadmeFolderPaths(files).forEach((folderPath) => occupied.add(folderPath));
    if (!occupied.has(normalized)) {
        return normalized;
    }

    let index = 2;
    let candidate = `${normalized}-${index}`;
    while (occupied.has(candidate)) {
        index += 1;
        candidate = `${normalized}-${index}`;
    }

    return candidate;
}

function getProfileInitials(displayName: string, username: string): string {
    const source = displayName.trim() || username.trim() || 'IUIN';
    const words = source.split(/\s+/).filter(Boolean);
    const initials = words.length > 1 ? `${words[0][0]}${words[1][0]}` : source.slice(0, 2);

    return initials.toUpperCase();
}

function getReadmeFileIcon(file: IuinReadmeFile): string {
    if (file.type === 'folder') {
        return 'icon-folder-outline';
    }

    if (file.path === IUIN_README_MAIN_FILE) {
        return 'icon-file-text-outline';
    }

    if (file.type === 'asset') {
        return 'icon-image-outline';
    }

    return 'icon-file-generic-outline';
}

function getUploadedReadmePath(file: File): string {
    const safeName = file.name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-');
    return file.type.startsWith('image/') ? `assets/${safeName}` : safeName;
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
        reader.readAsDataURL(file);
    });
}

function parseGitHubRepositoryUrl(value: string): GitHubRepositoryReference | null {
    const trimmed = value.trim().replace(/\/+$/, '');
    if (!trimmed) {
        return null;
    }

    let segments: string[] = [];
    try {
        const parsed = new URL(trimmed);
        if ((/^raw\.githubusercontent\.com$/i).test(parsed.hostname)) {
            segments = parsed.pathname.split('/').filter(Boolean);
            if (segments.length < 3) {
                return null;
            }

            return {
                owner: segments[0],
                repo: segments[1].replace(/\.git$/i, ''),
                ref: segments[2],
                path: normalizeReadmeRelativePath(segments.slice(3).join('/')),
            };
        }

        if (!(/(^|\.)github\.com$/i).test(parsed.hostname)) {
            return null;
        }
        segments = parsed.pathname.split('/').filter(Boolean);
    } catch {
        segments = trimmed.split(/[?#]/)[0].split('/').filter(Boolean);
    }

    if (segments.length === 0 || segments[0].startsWith('.')) {
        return null;
    }

    const owner = segments[0];
    const repo = (segments[1] || owner).replace(/\.git$/i, '');
    if (!owner || !repo) {
        return null;
    }

    const reference: GitHubRepositoryReference = {
        owner,
        repo,
    };

    const mode = segments[2];
    if ((mode === 'tree' || mode === 'blob' || mode === 'raw') && segments[3]) {
        reference.ref = segments[3];
        reference.path = normalizeReadmeRelativePath(segments.slice(4).join('/'));
    } else if (segments.length > 2) {
        reference.path = normalizeReadmeRelativePath(segments.slice(2).join('/'));
    }

    return reference;
}

function normalizeReadmeRelativePath(value: string): string {
    const clean = value.trim().split(/[?#]/)[0].replace(/^\/+/, '');
    const parts: string[] = [];

    clean.split('/').forEach((part) => {
        const segment = part.trim();
        if (!segment || segment === '.') {
            return;
        }

        if (segment === '..') {
            parts.pop();
            return;
        }

        parts.push(segment);
    });

    return parts.join('/');
}

function getReadmeDirectory(path: string): string {
    const normalized = normalizeReadmeRelativePath(path);
    const index = normalized.lastIndexOf('/');

    return index >= 0 ? normalized.slice(0, index) : '';
}

function getGitHubContentsUrl(owner: string, repo: string, path: string, ref: string): string {
    const encodedPath = normalizeReadmeRelativePath(path).
        split('/').
        filter(Boolean).
        map(encodeURIComponent).
        join('/');
    const contentsPath = encodedPath ? `/${encodedPath}` : '';

    return `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${contentsPath}?ref=${encodeURIComponent(ref)}`;
}

function getGitHubReadmeUrl(owner: string, repo: string, ref: string): string {
    return `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme?ref=${encodeURIComponent(ref)}`;
}

async function fetchGitHubJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
        headers: {
            Accept: 'application/vnd.github+json',
        },
    });

    if (!response.ok) {
        let message = `GitHub request failed (${response.status}).`;
        try {
            const body = await response.json();
            if (typeof body?.message === 'string') {
                message = body.message;
            }
        } catch {
            // Keep the status-based message when GitHub does not return JSON.
        }

        if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
            message = 'GitHub API rate limit reached. Please try again later.';
        }

        throw new Error(message);
    }

    return response.json();
}

async function fetchGitHubText(url: string, accept: string): Promise<string> {
    const response = await fetch(url, {
        headers: {
            Accept: accept,
        },
    });

    if (!response.ok) {
        throw new Error(`GitHub request failed (${response.status}).`);
    }

    return response.text();
}

async function fetchGitHubContents(owner: string, repo: string, path: string, ref: string): Promise<GitHubContentsEntry | GitHubContentsEntry[]> {
    return fetchGitHubJson<GitHubContentsEntry | GitHubContentsEntry[]>(getGitHubContentsUrl(owner, repo, path, ref));
}

async function tryFetchGitHubContents(owner: string, repo: string, path: string, ref: string): Promise<GitHubContentsEntry | GitHubContentsEntry[] | null> {
    try {
        return await fetchGitHubContents(owner, repo, path, ref);
    } catch {
        return null;
    }
}

async function tryFetchGitHubRenderedReadmeHtml(owner: string, repo: string, path: string, ref: string): Promise<string> {
    try {
        return await fetchGitHubText(getGitHubContentsUrl(owner, repo, path, ref), 'application/vnd.github.html');
    } catch {
        return '';
    }
}

async function fetchGitHubFileText(entry: GitHubContentsEntry): Promise<string> {
    if (entry.download_url) {
        const response = await fetch(entry.download_url);
        if (!response.ok) {
            throw new Error(`Could not download ${entry.path}.`);
        }

        return response.text();
    }

    if (entry.encoding === 'base64' && entry.content) {
        const binary = atob(entry.content.replace(/\s/g, ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        return new TextDecoder().decode(bytes);
    }

    return '';
}

function isReadmeEntry(entry: GitHubContentsEntry): boolean {
    return entry.type === 'file' && GITHUB_README_FILE_PATTERN.test(entry.name);
}

function isImportableGitHubEntry(entry: GitHubContentsEntry): boolean {
    if (entry.type !== 'file' || !GITHUB_IMPORTABLE_FILE_PATTERN.test(entry.name)) {
        return false;
    }

    if (GITHUB_ASSET_FILE_PATTERN.test(entry.name)) {
        return Boolean(entry.download_url);
    }

    return (entry.size || 0) <= GITHUB_IMPORT_TEXT_SIZE_LIMIT;
}

function getGitHubWorkspacePath(entryPath: string, readmeDir: string): string {
    const normalizedPath = normalizeReadmeRelativePath(entryPath);
    const normalizedDir = normalizeReadmeRelativePath(readmeDir);

    if (normalizedDir && normalizedPath.startsWith(`${normalizedDir}/`)) {
        return normalizedPath.slice(normalizedDir.length + 1);
    }

    return normalizedPath;
}

function isExternalReadmeReference(value: string): boolean {
    const trimmed = value.trim();

    return !trimmed ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('//') ||
        (/^[a-z][a-z0-9+.-]*:/i).test(trimmed);
}

function resolveGitHubReadmeReference(source: string, readmeDir: string): GitHubReadmeReference | null {
    let cleaned = source.trim().split(/[?#]/)[0];
    try {
        cleaned = decodeURIComponent(cleaned);
    } catch {
        // GitHub paths are often URL-encoded, but malformed user content should not abort import.
    }

    if (isExternalReadmeReference(cleaned)) {
        return null;
    }

    const repoPath = normalizeReadmeRelativePath([readmeDir, cleaned].filter(Boolean).join('/'));
    if (!repoPath || repoPath === normalizeReadmeRelativePath(readmeDir)) {
        return null;
    }

    return {
        source,
        repoPath,
        workspacePath: getGitHubWorkspacePath(repoPath, readmeDir),
    };
}

function getGitHubReadmeReferences(markdown: string, readmeDir: string): GitHubReadmeReference[] {
    const references = new Map<string, GitHubReadmeReference>();
    const addReference = (source: string) => {
        const reference = resolveGitHubReadmeReference(source, readmeDir);
        if (reference) {
            references.set(reference.source, reference);
        }
    };

    Array.from(markdown.matchAll(/!?\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)).forEach((match) => addReference(match[1]));
    Array.from(markdown.matchAll(/\b(?:src|href)=(["'])(.*?)\1/g)).forEach((match) => addReference(match[2]));

    return Array.from(references.values());
}

function rewriteGitHubReadmeReferences(markdown: string, references: GitHubReadmeReference[]): string {
    return references.reduce((content, reference) => {
        const sourcePattern = escapeRegExp(reference.source);

        return content.
            replace(new RegExp(`\\(${sourcePattern}(\\s+["'][^"']*["'])?\\)`, 'g'), (_match, title = '') => `(${reference.workspacePath}${title})`).
            replace(new RegExp(`\\b(src|href)=(["'])${sourcePattern}\\2`, 'g'), (_match, attribute, quote) => `${attribute}=${quote}${reference.workspacePath}${quote}`);
    }, markdown);
}

async function createGitHubWorkspaceFile(entry: GitHubContentsEntry, workspacePath: string): Promise<IuinReadmeFile | null> {
    const path = normalizeReadmeRelativePath(workspacePath);
    if (!path) {
        return null;
    }

    if (GITHUB_ASSET_FILE_PATTERN.test(entry.name)) {
        if (!entry.download_url) {
            return null;
        }

        return {
            path,
            content: entry.download_url,
            type: 'asset',
            updatedAt: Date.now(),
        };
    }

    const content = await fetchGitHubFileText(entry);
    if (!content.trim() && path !== IUIN_README_MAIN_FILE) {
        return null;
    }

    return {
        path,
        content,
        type: GITHUB_TEXT_FILE_PATTERN.test(path) ? 'markdown' : 'text',
        updatedAt: Date.now(),
    };
}

async function importGitHubReadmeWorkspace(repository: GitHubRepositoryReference): Promise<GitHubReadmeImport> {
    const metadata = await fetchGitHubJson<GitHubRepositoryMetadata>(`${GITHUB_API_BASE}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`);
    const ref = repository.ref || metadata.default_branch || 'main';
    const requestedPath = normalizeReadmeRelativePath(repository.path || '');
    const requestedContents = requestedPath ? await fetchGitHubContents(repository.owner, repository.repo, requestedPath, ref) : await fetchGitHubContents(repository.owner, repository.repo, '', ref);
    let directoryEntries: GitHubContentsEntry[] = Array.isArray(requestedContents) ? requestedContents : [];
    let readmeEntry = Array.isArray(requestedContents) ? directoryEntries.find(isReadmeEntry) || null : requestedContents;

    if (!readmeEntry && !requestedPath) {
        readmeEntry = await fetchGitHubJson<GitHubContentsEntry>(getGitHubReadmeUrl(repository.owner, repository.repo, ref));
    }

    if (!readmeEntry || readmeEntry.type !== 'file') {
        throw new Error('Could not find a public README file in that repository.');
    }

    const readmeDir = getReadmeDirectory(readmeEntry.path);
    if (directoryEntries.length === 0 || getReadmeDirectory(directoryEntries[0]?.path || '') !== readmeDir) {
        const readmeDirectoryContents = await tryFetchGitHubContents(repository.owner, repository.repo, readmeDir, ref);
        directoryEntries = Array.isArray(readmeDirectoryContents) ? readmeDirectoryContents : [];
    }

    const originalReadme = await fetchGitHubFileText(readmeEntry);
    const githubRenderedHtml = await tryFetchGitHubRenderedReadmeHtml(repository.owner, repository.repo, readmeEntry.path, ref);
    const references = getGitHubReadmeReferences(originalReadme, readmeDir);
    const importedReadme = rewriteGitHubReadmeReferences(originalReadme, references);
    const files: IuinReadmeFile[] = [{
        path: IUIN_README_MAIN_FILE,
        content: importedReadme,
        type: 'markdown',
        updatedAt: Date.now(),
    }];
    const seenRepoPaths = new Set([normalizeReadmeRelativePath(readmeEntry.path)]);
    const seenWorkspacePaths = new Set([IUIN_README_MAIN_FILE]);

    const pushEntry = async (entry: GitHubContentsEntry, workspacePath: string) => {
        if (files.length >= GITHUB_IMPORT_SUPPORT_FILE_LIMIT + 1 || !isImportableGitHubEntry(entry)) {
            return;
        }

        const repoPath = normalizeReadmeRelativePath(entry.path);
        const nextWorkspacePath = normalizeReadmeRelativePath(workspacePath);
        if (!repoPath || !nextWorkspacePath || seenRepoPaths.has(repoPath) || seenWorkspacePaths.has(nextWorkspacePath)) {
            return;
        }

        const file = await createGitHubWorkspaceFile(entry, nextWorkspacePath);
        if (!file) {
            return;
        }

        seenRepoPaths.add(repoPath);
        seenWorkspacePaths.add(file.path);
        files.push(file);
    };

    for (const reference of references) {
        const entry = await tryFetchGitHubContents(repository.owner, repository.repo, reference.repoPath, ref);
        if (entry && !Array.isArray(entry)) {
            await pushEntry(entry, reference.workspacePath);
        }
    }

    for (const entry of directoryEntries) {
        if (entry.path === readmeEntry.path) {
            continue;
        }
        await pushEntry(entry, getGitHubWorkspacePath(entry.path, readmeDir));
    }

    return {
        rootName: `${repository.owner}-${repository.repo}`,
        files,
        githubRenderedHtml,
        supportingFileCount: Math.max(files.length - 1, 0),
    };
}

function getDraftWithReadmeWorkspace(draft: IuinProfileData, workspace: IuinReadmeWorkspace): IuinProfileData {
    const homepageReadme = getReadmeFileContent(workspace, IUIN_README_MAIN_FILE) || draft.homepageHtml;

    return {
        ...draft,
        homepageHtml: homepageReadme,
        readmeWorkspace: serializeIuinReadmeWorkspace(workspace),
    };
}

function renderReadmeWorkspacePreview(markdown: string, workspace: IuinReadmeWorkspace): string {
    if (workspace.githubRenderedHtml) {
        const resolvedHtml = resolveReadmeWorkspaceAssetReferences(extractGitHubRenderedReadmeBody(workspace.githubRenderedHtml), workspace);

        return sanitizeIuinProfileHtml(resolvedHtml);
    }

    const resolvedMarkdown = resolveReadmeWorkspaceAssetReferences(markdown, workspace);

    return renderIuinReadmeMarkdown(resolvedMarkdown);
}

function resolveReadmeWorkspaceAssetReferences(content: string, workspace: IuinReadmeWorkspace): string {
    return workspace.files.reduce((nextContent, file) => {
        const isResolvedAsset = file.content.startsWith('data:') || file.content.startsWith('http://') || file.content.startsWith('https://');
        if (file.type === 'folder' || file.type !== 'asset' || !isResolvedAsset) {
            return nextContent;
        }

        const sourcePattern = getReadmePreviewReferenceAliases(file.path).map(escapeRegExp).join('|');
        if (!sourcePattern) {
            return nextContent;
        }

        return nextContent.
            replace(new RegExp(`\\((?:${sourcePattern})([?#][^\\)\\s]*)?(\\s+["'][^"']*["'])?\\)`, 'g'), (_match, suffix = '', title = '') => `(${file.content}${suffix}${title})`).
            replace(new RegExp(`\\b(src|href)=(["'])(?:${sourcePattern})([?#][^"']*)?\\2`, 'g'), (_match, attribute, quote, suffix = '') => `${attribute}=${quote}${file.content}${suffix}${quote}`);
    }, content);
}

function extractGitHubRenderedReadmeBody(html: string): string {
    if (typeof DOMParser === 'undefined') {
        return html;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const article = doc.querySelector('article.markdown-body') || doc.querySelector('article');

    return article?.innerHTML || doc.body.innerHTML || html;
}

function getReadmePreviewReferenceAliases(path: string): string[] {
    const normalized = normalizeReadmeRelativePath(path);
    if (!normalized) {
        return [];
    }

    const encoded = normalized.split('/').map(encodeURIComponent).join('/');
    const aliases = [
        normalized,
        `./${normalized}`,
        encoded,
        `./${encoded}`,
    ];

    return Array.from(new Set(aliases));
}

function getSameNameProfileRepositoryFromRootName(rootName: string): GitHubRepositoryReference | null {
    const segments = rootName.split('-').map((segment) => segment.trim()).filter(Boolean);
    if (segments.length < 2 || segments.length % 2 !== 0) {
        return null;
    }

    const middle = segments.length / 2;
    const owner = segments.slice(0, middle).join('-');
    const repo = segments.slice(middle).join('-');
    if (!owner || owner !== repo) {
        return null;
    }

    return {
        owner,
        repo,
    };
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function downloadReadmeFile(file: IuinReadmeFile) {
    if (typeof document === 'undefined') {
        return;
    }

    const blob = file.type === 'asset' && file.content.startsWith('data:') ? dataUrlToBlob(file.content) : new Blob([file.content], {type: 'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getReadmeBasename(file.path);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function dataUrlToBlob(dataUrl: string): Blob {
    const [header, data = ''] = dataUrl.split(',');
    const mime = header.match(/^data:([^;]+)/)?.[1] || 'application/octet-stream';
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], {type: mime});
}

type IuinReadmeAdvancedEditorProps = {
    currentUser: UserProfile;
    embedded?: boolean;
    draft?: IuinProfileData;
    setDraft?: Dispatch<SetStateAction<IuinProfileData>>;
    onClose?: () => void;
};

function IuinReadmeAdvancedEditor({currentUser, embedded = false, draft: controlledDraft, setDraft: setControlledDraft, onClose}: IuinReadmeAdvancedEditorProps) {
    const intl = useIntl();
    const dispatch = useDispatch();
    const uploadInputRef = useRef<HTMLInputElement | null>(null);
    const [localDraft, setLocalDraft] = useState(() => getIuinProfileData(currentUser));
    const [activePath, setActivePath] = useState(IUIN_README_MAIN_FILE);
    const [githubUrl, setGithubUrl] = useState('');
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(['assets', 'images', 'docs']));
    const hydratedGithubPreviewRootsRef = useRef<Set<string>>(new Set());
    const draft = controlledDraft || localDraft;
    const setReadmeDraft = useCallback((nextDraft: SetStateAction<IuinProfileData>) => {
        if (setControlledDraft) {
            setControlledDraft(nextDraft);
            return;
        }

        setLocalDraft(nextDraft);
    }, [setControlledDraft]);
    const workspace = useMemo(() => parseIuinReadmeWorkspace(draft.readmeWorkspace, draft.homepageHtml, getReadmeRootName(currentUser)), [currentUser, draft.homepageHtml, draft.readmeWorkspace]);
    const selectedFile = workspace.files.find((file) => file.path === activePath && file.type !== 'folder') || workspace.files.find((file) => file.type !== 'folder') || workspace.files[0];
    const readmeFile = workspace.files.find((file) => file.path === IUIN_README_MAIN_FILE);
    const readmeContent = getReadmeFileContent(workspace, IUIN_README_MAIN_FILE);
    const readmeHtml = useMemo(() => renderReadmeWorkspacePreview(readmeContent, workspace), [readmeContent, workspace]);
    const fileTree = useMemo(() => createReadmeFileTree(workspace.files), [workspace.files]);
    const readmeToasts = useMemo<Array<{id: string; type: 'error' | 'success'; text: string}>>(() => {
        const toasts: Array<{id: string; type: 'error' | 'success'; text: string}> = [];

        if (error) {
            toasts.push({
                id: 'readme-error',
                type: 'error',
                text: error,
            });
        }

        if (notice && notice !== error) {
            toasts.push({
                id: 'readme-notice',
                type: 'success',
                text: notice,
            });
        }

        return toasts;
    }, [error, notice]);

    useEffect(() => {
        const nextDraft = getIuinProfileData(currentUser);
        const nextWorkspace = parseIuinReadmeWorkspace(nextDraft.readmeWorkspace, nextDraft.homepageHtml, getReadmeRootName(currentUser));
        if (!setControlledDraft) {
            setReadmeDraft(nextDraft);
        }
        setActivePath(nextWorkspace.activePath || IUIN_README_MAIN_FILE);
        setError('');
        setNotice('');
    }, [currentUser, setControlledDraft, setReadmeDraft]);

    useEffect(() => {
        if (readmeToasts.length === 0) {
            return undefined;
        }

        const hasErrorToast = readmeToasts.some((toast) => toast.type === 'error');
        const timeoutId = window.setTimeout(() => {
            setError('');
            setNotice('');
        }, hasErrorToast ? 5200 : 3600);

        return () => window.clearTimeout(timeoutId);
    }, [readmeToasts]);

    const updateWorkspace = useCallback((updater: (workspace: IuinReadmeWorkspace) => IuinReadmeWorkspace) => {
        setReadmeDraft((previous) => {
            const currentWorkspace = parseIuinReadmeWorkspace(previous.readmeWorkspace, previous.homepageHtml, getReadmeRootName(currentUser));
            const nextWorkspace = updater(currentWorkspace);
            const homepageReadme = getReadmeFileContent(nextWorkspace, IUIN_README_MAIN_FILE) || previous.homepageHtml;

            return {
                ...previous,
                homepageHtml: homepageReadme,
                readmeWorkspace: serializeIuinReadmeWorkspace(nextWorkspace),
            };
        });
        setSaveState('idle');
        setError('');
    }, [currentUser, setReadmeDraft]);

    useEffect(() => {
        if (workspace.githubRenderedHtml) {
            return undefined;
        }

        const repository = getSameNameProfileRepositoryFromRootName(workspace.rootName);
        if (!repository) {
            return undefined;
        }

        const hydrationKey = `${repository.owner}/${repository.repo}`;
        if (hydratedGithubPreviewRootsRef.current.has(hydrationKey)) {
            return undefined;
        }

        hydratedGithubPreviewRootsRef.current.add(hydrationKey);
        let cancelled = false;

        const hydratePreview = async () => {
            try {
                const metadata = await fetchGitHubJson<GitHubRepositoryMetadata>(`${GITHUB_API_BASE}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`);
                const renderedHtml = await tryFetchGitHubRenderedReadmeHtml(repository.owner, repository.repo, IUIN_README_MAIN_FILE, metadata.default_branch || 'main');
                if (!cancelled && renderedHtml) {
                    updateWorkspace((previous) => previous.githubRenderedHtml ? previous : {
                        ...previous,
                        githubRenderedHtml: renderedHtml,
                    });
                }
            } catch {
                // Existing imports still render through the local Markdown path when GitHub is unreachable.
            }
        };

        hydratePreview();

        return () => {
            cancelled = true;
        };
    }, [updateWorkspace, workspace.githubRenderedHtml, workspace.rootName]);

    const selectReadmeFile = useCallback((path: string) => {
        setActivePath(path);
        updateWorkspace((previous) => ({
            ...previous,
            activePath: path,
        }));
    }, [updateWorkspace]);

    const updateSelectedFile = useCallback((content: string) => {
        if (!selectedFile) {
            return;
        }

        updateWorkspace((previous) => setReadmeFileContent(previous, selectedFile.path, content, selectedFile.type));
    }, [selectedFile, updateWorkspace]);

    const createReadmeFile = useCallback(() => {
        const path = getUniqueReadmePath(workspace.files, 'untitled.md');
        updateWorkspace((previous) => setReadmeFileContent(previous, path, '', 'markdown'));
        setActivePath(path);
        setNotice(intl.formatMessage({
            id: 'iuin_profile.readme.file_created',
            defaultMessage: 'New README file created.',
        }));
    }, [intl, updateWorkspace, workspace.files]);

    const createReadmeFolder = useCallback(() => {
        const path = getUniqueReadmeFolderPath(workspace.files, 'new-folder');
        updateWorkspace((previous) => ({
            ...setReadmeFileContent(previous, path, '', 'folder'),
            activePath: previous.activePath || IUIN_README_MAIN_FILE,
        }));
        setExpandedFolders((previous) => {
            const next = new Set(previous);
            next.add(path);
            return next;
        });
        setNotice(intl.formatMessage({
            id: 'iuin_profile.readme.folder_created',
            defaultMessage: 'New folder created.',
        }));
    }, [intl, updateWorkspace, workspace.files]);

    const removeSelectedFile = useCallback(() => {
        if (!selectedFile || selectedFile.path === IUIN_README_MAIN_FILE) {
            return;
        }

        updateWorkspace((previous) => removeReadmeFile(previous, selectedFile.path));
        setActivePath(IUIN_README_MAIN_FILE);
    }, [selectedFile, updateWorkspace]);

    const toggleReadmeFolder = useCallback((path: string) => {
        setExpandedFolders((previous) => {
            const next = new Set(previous);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }

            return next;
        });
    }, []);

    const renderReadmeTreeNode = useCallback((node: ReadmeFileTreeNode, depth = 0): React.ReactNode => {
        const indent = 12 + depth * 17;
        if (node.type === 'folder') {
            const isExpanded = expandedFolders.has(node.path);

            return (
                <React.Fragment key={`folder-${node.path}`}>
                    <button
                        type='button'
                        className={`iuin-readme-workbench__tree-row iuin-readme-workbench__tree-row--folder${isExpanded ? ' expanded' : ''}`}
                        style={{paddingLeft: `${indent}px`}}
                        onClick={() => toggleReadmeFolder(node.path)}
                        aria-expanded={isExpanded}
                    >
                        <i className={`icon ${isExpanded ? 'icon-chevron-down' : 'icon-chevron-right'} iuin-readme-workbench__tree-chevron`}/>
                        <i className='icon icon-folder-outline'/>
                        <span>{node.name}</span>
                    </button>
                    {isExpanded && node.children.map((child) => renderReadmeTreeNode(child, depth + 1))}
                </React.Fragment>
            );
        }

        if (!node.file) {
            return null;
        }

        const isActive = node.file.path === selectedFile?.path;

        return (
            <div
                key={node.file.path}
                className={`iuin-readme-workbench__tree-file-row${isActive ? ' active' : ''}`}
            >
                <button
                    type='button'
                    className='iuin-readme-workbench__tree-row iuin-readme-workbench__tree-row--file'
                    style={{paddingLeft: `${indent + 18}px`}}
                    onClick={() => selectReadmeFile(node.file!.path)}
                >
                    <i className={`icon ${getReadmeFileIcon(node.file)}`}/>
                    <span>{node.name}</span>
                </button>
                {isActive && (
                    <button
                        type='button'
                        className='iuin-readme-workbench__tree-menu'
                        onClick={(event) => {
                            event.stopPropagation();
                            downloadReadmeFile(node.file!);
                        }}
                        aria-label='Download selected file'
                        title='Download selected file'
                    >
                        <i className='icon icon-dots-vertical'/>
                    </button>
                )}
            </div>
        );
    }, [expandedFolders, selectReadmeFile, selectedFile?.path, toggleReadmeFolder]);

    const handleReadmeUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (files.length === 0) {
            return;
        }

        try {
            const uploadedFiles = await Promise.all(files.map(async (file): Promise<IuinReadmeFile> => {
                if (file.size > MAX_STATUS_MEDIA_SIZE) {
                    throw new Error(intl.formatMessage({
                        id: 'iuin_profile.editor.image_size',
                        defaultMessage: 'Please keep status images under 2 MB.',
                    }));
                }

                const path = getUploadedReadmePath(file);
                const isImage = file.type.startsWith('image/') && !file.type.includes('svg');
                const content = isImage ? await readFileAsDataUrl(file) : await file.text();

                return {
                    path,
                    content,
                    type: isImage ? 'asset' : path.toLowerCase().endsWith('.md') ? 'markdown' : 'text',
                    updatedAt: Date.now(),
                };
            }));

            updateWorkspace((previous) => ({
                ...uploadedFiles.reduce((workspace, file) => setReadmeFileContent(
                    workspace,
                    file.path,
                    file.content,
                    file.type,
                ), previous),
                activePath: uploadedFiles[0]?.path || previous.activePath,
            }));
            setActivePath(uploadedFiles[0]?.path || activePath);
            setExpandedFolders((previous) => {
                const next = new Set(previous);
                uploadedFiles.forEach((file) => {
                    const directory = getReadmeDirectory(file.path);
                    if (directory) {
                        next.add(directory);
                    }
                });
                return next;
            });
            setNotice(intl.formatMessage({
                id: 'iuin_profile.readme.uploaded',
                defaultMessage: 'File uploaded to README workspace.',
            }));
        } catch (err) {
            setError(err instanceof Error ? err.message : intl.formatMessage({
                id: 'iuin_profile.readme.upload_error',
                defaultMessage: 'Could not upload file.',
            }));
        }
    }, [activePath, intl, updateWorkspace]);

    const insertSelectedFileIntoReadme = useCallback(() => {
        if (!selectedFile || selectedFile.path === IUIN_README_MAIN_FILE || selectedFile.type === 'folder') {
            return;
        }

        const label = getReadmeBasename(selectedFile.path).replace(/\.[^.]+$/, '');
        const snippet = selectedFile.type === 'asset' ? `\n\n![${label}](./${selectedFile.path})\n` : `\n\n[${label}](./${selectedFile.path})\n`;
        updateWorkspace((previous) => setReadmeFileContent(
            previous,
            IUIN_README_MAIN_FILE,
            `${getReadmeFileContent(previous, IUIN_README_MAIN_FILE).trimEnd()}${snippet}`,
            'markdown',
        ));
        setActivePath(IUIN_README_MAIN_FILE);
        setNotice(intl.formatMessage({
            id: 'iuin_profile.readme.inserted',
            defaultMessage: 'Reference inserted into README.md.',
        }));
    }, [intl, selectedFile, updateWorkspace]);

    const importFromGitHub = useCallback(async () => {
        const repository = parseGitHubRepositoryUrl(githubUrl);
        if (!repository) {
            setError(intl.formatMessage({
                id: 'iuin_profile.readme.github_url_error',
                defaultMessage: 'Enter a GitHub repository URL like https://github.com/owner/repo.',
            }));
            return;
        }

        setImporting(true);
        setSaveState('saving');
        setError('');
        setNotice('');

        try {
            const imported = await importGitHubReadmeWorkspace(repository);
            const importedWorkspace: IuinReadmeWorkspace = {
                rootName: imported.rootName,
                activePath: IUIN_README_MAIN_FILE,
                githubRenderedHtml: imported.githubRenderedHtml,
                files: imported.files,
            };
            const nextDraft = getDraftWithReadmeWorkspace(draft, importedWorkspace);
            setReadmeDraft(nextDraft);
            setActivePath(IUIN_README_MAIN_FILE);
            setGithubUrl('');
            setExpandedFolders((previous) => {
                const next = new Set(previous);
                imported.files.forEach((file) => {
                    const directory = getReadmeDirectory(file.path);
                    if (directory) {
                        next.add(directory);
                    }
                });
                return next;
            });
            const result = await dispatch(updateMe(getProfilePatch(currentUser, nextDraft)) as any) as any;
            if (result.error) {
                const message = typeof result.error?.message === 'string' ? result.error.message : intl.formatMessage({
                    id: 'iuin_profile.readme.github_import_save_error',
                    defaultMessage: 'Could not save the imported README.',
                });
                setSaveState('error');
                setError(intl.formatMessage({
                    id: 'iuin_profile.readme.github_imported_save_failed',
                    defaultMessage: 'README.md was imported into the editor, but saving failed: {message}',
                }, {message}));
                return;
            }

            setSaveState('saved');
            setNotice(imported.supportingFileCount > 0 ? intl.formatMessage({
                id: 'iuin_profile.readme.github_imported_with_files',
                defaultMessage: 'README.md imported from GitHub with {count} supporting files and saved.',
            }, {count: imported.supportingFileCount}) : intl.formatMessage({
                id: 'iuin_profile.readme.github_imported',
                defaultMessage: 'README.md imported from GitHub and saved.',
            }));
        } catch (err) {
            setSaveState('error');
            setError(err instanceof Error ? err.message : intl.formatMessage({
                id: 'iuin_profile.readme.github_import_error',
                defaultMessage: 'Could not import the GitHub README.',
            }));
        } finally {
            setImporting(false);
        }
    }, [currentUser, dispatch, draft, githubUrl, intl, setReadmeDraft]);

    const saveReadmeWorkspace = useCallback(async () => {
        if (saveState === 'saving') {
            return;
        }

        setSaveState('saving');
        setError('');
        setNotice('');

        try {
            const result = await dispatch(updateMe(getProfilePatch(currentUser, draft)) as any) as any;
            if (result.error) {
                setSaveState('error');
                setError(result.error.message || intl.formatMessage({
                    id: 'iuin_profile.editor.save_error',
                    defaultMessage: 'Could not save profile.',
                }));
                return;
            }

            setSaveState('saved');
            setNotice(intl.formatMessage({
                id: 'iuin_profile.readme.saved',
                defaultMessage: 'README workspace saved.',
            }));
        } catch (err) {
            setSaveState('error');
            setError(err instanceof Error ? err.message : intl.formatMessage({
                id: 'iuin_profile.editor.save_error',
                defaultMessage: 'Could not save profile.',
            }));
        }
    }, [currentUser, dispatch, draft, intl, saveState]);

    const isSelectedEditable = Boolean(selectedFile && selectedFile.type !== 'asset' && selectedFile.type !== 'folder');
    const WorkbenchElement = embedded ? 'section' : 'main';
    const workbenchClassName = `iuin-readme-workbench${embedded ? ' iuin-readme-workbench--embedded' : ''}`;
    const handleClose = () => {
        if (onClose) {
            onClose();
            return;
        }

        getHistory().push(getEditorSectionUrl(currentUser.username, 'homepage'));
    };

    return (
        <WorkbenchElement className={workbenchClassName}>
            <input
                ref={uploadInputRef}
                className='iuin-readme-workbench__upload-input'
                type='file'
                multiple={true}
                accept='.md,.markdown,.txt,.png,.jpg,.jpeg,.gif,.webp,.svg'
                onChange={handleReadmeUpload}
                hidden={true}
            />
            <header className='iuin-readme-workbench__menubar'>
                <div className='iuin-readme-workbench__brand'>
                    <span className='iuin-readme-workbench__brand-mark'>I</span>
                    <span className='iuin-readme-workbench__product-label'>README Designer</span>
                </div>
                <div className='iuin-readme-workbench__top-actions'>
                    <button
                        type='button'
                        className='iuin-readme-workbench__ghost-button'
                        disabled={saveState === 'saving'}
                        onClick={handleClose}
                    >
                        <span>Cancel</span>
                    </button>
                    <button
                        type='button'
                        className={`iuin-readme-workbench__save-button${saveState === 'saving' ? ' is-saving' : ''}${saveState === 'saved' ? ' is-saved' : ''}`}
                        onClick={saveReadmeWorkspace}
                        disabled={saveState === 'saving'}
                        aria-busy={saveState === 'saving'}
                    >
                        <span>
                            {saveState === 'saving' ? (
                                <FormattedMessage
                                    id='iuin_profile.editor.saving'
                                    defaultMessage='Saving...'
                                />
                            ) : saveState === 'saved' ? (
                                <FormattedMessage
                                    id='iuin_profile.editor.saved'
                                    defaultMessage='Saved'
                                />
                            ) : (
                                <FormattedMessage
                                    id='iuin_profile.editor.save'
                                    defaultMessage='Save homepage'
                                />
                            )}
                        </span>
                    </button>
                </div>
            </header>

            <div className='iuin-readme-workbench__body'>
                <aside className='iuin-readme-workbench__sidebar'>
                    <section className='iuin-readme-workbench__sidebar-panel iuin-readme-workbench__sidebar-panel--tree'>
                        <div className='iuin-readme-workbench__sidebar-header'>
                            <button type='button' className='iuin-readme-workbench__sidebar-title'>
                                <i className='icon icon-chevron-down'/>
                                <span>File tree</span>
                            </button>
                            <div className='iuin-readme-workbench__tree-actions'>
                                <button
                                    type='button'
                                    onClick={createReadmeFile}
                                    aria-label='New file'
                                    title='New file'
                                >
                                    <i className='icon icon-file-text-outline'/>
                                </button>
                                <button
                                    type='button'
                                    onClick={createReadmeFolder}
                                    aria-label='New folder'
                                    title='New folder'
                                >
                                    <i className='icon icon-folder-outline'/>
                                </button>
                                <button
                                    type='button'
                                    onClick={() => uploadInputRef.current?.click()}
                                    aria-label='Upload files'
                                    title='Upload files'
                                >
                                    <i className='icon icon-upload-outline'/>
                                </button>
                            </div>
                        </div>
                        <div className='iuin-readme-workbench__file-list'>
                            {fileTree.map((node) => renderReadmeTreeNode(node))}
                        </div>
                    </section>

                    <section className='iuin-readme-workbench__sidebar-panel iuin-readme-workbench__sidebar-panel--github'>
                        <div className='iuin-readme-workbench__sidebar-header'>
                            <button type='button' className='iuin-readme-workbench__sidebar-title'>
                                <i className='icon icon-github-circle'/>
                                <span>GitHub import</span>
                            </button>
                        </div>
                        <div className='iuin-readme-workbench__github-panel'>
                            <div className='iuin-readme-workbench__github-inline'>
                                <i className='icon icon-github-circle'/>
                                <input
                                    value={githubUrl}
                                    onChange={(event) => setGithubUrl(event.target.value)}
                                    onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                                        if (event.key === 'Enter' && githubUrl.trim() && !importing) {
                                            importFromGitHub();
                                        }
                                    }}
                                    placeholder='https://github.com/owner/repository'
                                />
                                <button
                                    type='button'
                                    className={importing ? 'is-importing' : undefined}
                                    onClick={importFromGitHub}
                                    disabled={importing || !githubUrl.trim()}
                                >
                                    <i className='icon icon-download-outline'/>
                                    <span>{importing ? 'Importing' : 'Import'}</span>
                                </button>
                            </div>
                        </div>
                    </section>
                </aside>

                <section className='iuin-readme-workbench__source'>
                    <div className='iuin-readme-workbench__file-tab'>
                        <div>
                            <i className={`icon ${selectedFile ? getReadmeFileIcon(selectedFile) : 'icon-file-text-outline'}`}/>
                            <span>{selectedFile?.path || IUIN_README_MAIN_FILE}</span>
                        </div>
                        <div className='iuin-readme-workbench__file-actions'>
                            {selectedFile && selectedFile.path !== IUIN_README_MAIN_FILE && (
                                <>
                                    <button
                                        type='button'
                                        className='iuin-readme-workbench__toolbar-button iuin-readme-workbench__toolbar-button--text'
                                        onClick={insertSelectedFileIntoReadme}
                                    >
                                        <i className='icon icon-link-variant'/>
                                        <span>Insert into README</span>
                                    </button>
                                    <button
                                        type='button'
                                        className='iuin-readme-workbench__toolbar-button iuin-readme-workbench__toolbar-button--text iuin-readme-workbench__toolbar-button--danger'
                                        onClick={removeSelectedFile}
                                    >
                                        <i className='icon icon-trash-can-outline'/>
                                        <span>Delete</span>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                    {readmeToasts.length > 0 && (
                        <div className='iuin-profile-editor__toast-stack'>
                            {readmeToasts.map((toast) => (
                                <div
                                    key={toast.id}
                                    className={`iuin-profile-editor__toast iuin-profile-editor__toast--${toast.type}`}
                                    role={toast.type === 'error' ? 'alert' : 'status'}
                                    aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
                                >
                                    <span
                                        className='iuin-profile-editor__toast-icon'
                                        aria-hidden='true'
                                    >
                                        <i className={`icon ${toast.type === 'error' ? 'icon-alert-outline' : 'icon-check'}`}/>
                                    </span>
                                    <span className='iuin-profile-editor__toast-copy'>
                                        {toast.text}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className='iuin-readme-workbench__editor-shell'>
                        {selectedFile?.type === 'asset' ? (
                            <div className='iuin-readme-workbench__asset-preview'>
                                <img
                                    src={selectedFile.content}
                                    alt={getReadmeBasename(selectedFile.path)}
                                />
                                <code>{`![${getReadmeBasename(selectedFile.path).replace(/\.[^.]+$/, '')}](./${selectedFile.path})`}</code>
                            </div>
                        ) : (
                            <HtmlCodeEditor
                                value={isSelectedEditable ? selectedFile?.content || '' : ''}
                                onChange={updateSelectedFile}
                            />
                        )}
                    </div>
                </section>

                <section className='iuin-readme-workbench__preview'>
                    <div className='iuin-readme-workbench__preview-toolbar'>
                        <div className='iuin-readme-workbench__preview-title'>
                            <span>Preview</span>
                            <strong>{workspace.rootName}</strong>
                        </div>
                        <div className='iuin-readme-workbench__preview-actions'>
                            {readmeFile && (
                                <button
                                    type='button'
                                    onClick={() => downloadReadmeFile(readmeFile)}
                                >
                                    <i className='icon icon-download-outline'/>
                                    <span>Download</span>
                                </button>
                            )}
                        </div>
                    </div>
                    <div className='iuin-readme-workbench__preview-canvas'>
                        <article
                            className='iuin-profile-rendered iuin-readme-workbench__preview-body'
                            dangerouslySetInnerHTML={{__html: readmeHtml}}
                        />
                    </div>
                </section>
            </div>
        </WorkbenchElement>
    );
}

function IuinProfileEditor({currentUser, initialSection = 'homepage'}: {currentUser: UserProfile; initialSection?: EditorSection}) {
    const intl = useIntl();
    const dispatch = useDispatch();
    const passwordConfig = useSelector(getPasswordConfig);
    const [draft, setDraft] = useState(() => getIuinProfileData(currentUser));
    const [accountDraft, setAccountDraft] = useState(() => getAccountDraft(currentUser));
    const [passwordDraft, setPasswordDraft] = useState<PasswordDraft>(() => getEmptyPasswordDraft());
    const [passwordMessage, setPasswordMessage] = useState<PasswordMessage | null>(null);
    const [academicDialog, setAcademicDialog] = useState<AcademicEntryDialogState | null>(null);
    const [activeTab, setActiveTab] = useState<EditorTab>('code');
    const [activeSection, setActiveSection] = useState<EditorSection>(initialSection);
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [accountSaveState, setAccountSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [securitySaveState, setSecuritySaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [settings, setSettings] = useState<IuinProfileSettingsResponse | null>(null);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [editingResearchFieldIndex, setEditingResearchFieldIndex] = useState<number | null>(null);
    const [researchFieldDraft, setResearchFieldDraft] = useState('');
    const [visualDragState, setVisualDragState] = useState<VisualDragState | null>(null);
    const visualSnapEnabled = true;
    const [visualWidgetDialog, setVisualWidgetDialog] = useState<VisualWidgetDialogType | null>(null);
    const [skillWidgetDraft, setSkillWidgetDraft] = useState<SkillWidgetDraft>(() => getDefaultSkillWidgetDraft());
    const [badgeWidgetDraft, setBadgeWidgetDraft] = useState<BadgeWidgetDraft>(() => getDefaultBadgeWidgetDraft(currentUser.username, currentUser.email || ''));
    const [visualDeleteAnchor, setVisualDeleteAnchor] = useState<VisualDeleteAnchor | null>(null);
    const visualStageRef = useRef<HTMLDivElement | null>(null);
    const readmeWorkspace = useMemo(() => parseIuinReadmeWorkspace(draft.readmeWorkspace, draft.homepageHtml, getReadmeRootName(currentUser)), [currentUser, draft.homepageHtml, draft.readmeWorkspace]);
    const readmeContent = useMemo(() => getReadmeFileContent(readmeWorkspace, IUIN_README_MAIN_FILE), [readmeWorkspace]);
    const readmeHtml = useMemo(() => renderReadmeWorkspacePreview(readmeContent, readmeWorkspace), [readmeContent, readmeWorkspace]);
    const researchFields = useMemo(() => splitProfileList(draft.researchFields), [draft.researchFields]);
    const experienceEntries = useMemo(() => parseIuinAcademicEntries(draft.experience), [draft.experience]);
    const educationEntries = useMemo(() => parseIuinAcademicEntries(draft.education), [draft.education]);
    const paperEntries = useMemo(() => parseIuinAcademicEntries(draft.papers), [draft.papers]);
    const awardEntries = useMemo(() => parseIuinAcademicEntries(draft.awards), [draft.awards]);
    const sectionVisibility = useMemo(() => parseSectionVisibility(draft.sectionVisibility), [draft.sectionVisibility]);
    const academicEntriesBySection = useMemo<Record<AcademicSectionId, IuinAcademicEntry[]>>(() => ({
        experience: experienceEntries,
        education: educationEntries,
        papers: paperEntries,
        awards: awardEntries,
    }), [awardEntries, educationEntries, experienceEntries, paperEntries]);
    const otherSessions = useMemo(() => sessions.filter((session) => session.id !== settings?.security.current_session_id && session.props?.type !== 'UserAccessToken'), [sessions, settings]);
    const editorDisplayName = `${accountDraft.firstName || ''} ${accountDraft.lastName || ''}`.trim() || accountDraft.nickname || accountDraft.username || currentUser.username;
    const editorPosition = accountDraft.position || currentUser.position;
    const editorAvatarUrl = Client4.getProfilePictureUrl(currentUser.id, currentUser.last_picture_update);
    const editorToasts = useMemo<Array<{id: string; type: 'error' | 'success'; text: string}>>(() => {
        const toasts: Array<{id: string; type: 'error' | 'success'; text: string}> = [];

        if (passwordMessage?.text) {
            toasts.push({
                id: `password-${passwordMessage.type}`,
                type: passwordMessage.type,
                text: passwordMessage.text,
            });
        }

        if (error && error !== passwordMessage?.text) {
            toasts.push({
                id: 'error',
                type: 'error',
                text: error,
            });
        }

        if (notice && notice !== passwordMessage?.text) {
            toasts.push({
                id: 'notice',
                type: 'success',
                text: notice,
            });
        }

        return toasts;
    }, [error, notice, passwordMessage]);

    useEffect(() => {
        setDraft(getIuinProfileData(currentUser));
        setAccountDraft(getAccountDraft(currentUser));
        setPasswordDraft(getEmptyPasswordDraft());
        setSettings(null);
        setSessions([]);
        setEditingResearchFieldIndex(null);
        setResearchFieldDraft('');
        setAcademicDialog(null);
        setVisualDragState(null);
        setVisualWidgetDialog(null);
        setSkillWidgetDraft(getDefaultSkillWidgetDraft());
        setBadgeWidgetDraft(getDefaultBadgeWidgetDraft(currentUser.username, currentUser.email || ''));
        setVisualDeleteAnchor(null);
    }, [currentUser.id]);

    useEffect(() => {
        setActiveSection(initialSection);
    }, [initialSection]);

    const selectEditorSection = useCallback((section: EditorSection) => {
        setActiveSection(section);
        getHistory().push(getEditorSectionUrl(currentUser.username, section));
    }, [currentUser.username]);

    const setAdvancedDraft = useCallback<Dispatch<SetStateAction<IuinProfileData>>>((nextDraft) => {
        setDraft((previous) => (typeof nextDraft === 'function' ? (nextDraft as (previousDraft: IuinProfileData) => IuinProfileData)(previous) : nextDraft));
        setSaveState('idle');
    }, []);

    const setField = useCallback((field: keyof typeof draft, value: string) => {
        setDraft((previous) => ({
            ...previous,
            [field]: value,
        }));
        setSaveState('idle');
    }, []);

    const updateReadmeWorkspace = useCallback((updater: (workspace: IuinReadmeWorkspace) => IuinReadmeWorkspace) => {
        setDraft((previous) => ({
            ...previous,
            ...(() => {
                const currentWorkspace = parseIuinReadmeWorkspace(previous.readmeWorkspace, previous.homepageHtml, getReadmeRootName(currentUser));
                const nextWorkspace = updater(currentWorkspace);
                const homepageReadme = getReadmeFileContent(nextWorkspace, IUIN_README_MAIN_FILE) || previous.homepageHtml;

                return {
                    homepageHtml: homepageReadme,
                    readmeWorkspace: serializeIuinReadmeWorkspace(nextWorkspace),
                };
            })(),
        }));
        setSaveState('idle');
    }, [currentUser]);

    const updateHomepageHtml = useCallback((updater: (html: string) => string) => {
        updateReadmeWorkspace((workspace) => setReadmeFileContent(
            workspace,
            IUIN_README_MAIN_FILE,
            updater(getReadmeFileContent(workspace, IUIN_README_MAIN_FILE)),
            'markdown',
        ));
    }, [updateReadmeWorkspace]);

    const setMainReadmeContent = useCallback((value: string) => {
        updateReadmeWorkspace((workspace) => setReadmeFileContent(workspace, IUIN_README_MAIN_FILE, value, 'markdown'));
    }, [updateReadmeWorkspace]);

    const scheduleVisualPreviewLayoutResolve = useCallback(() => {
        if (typeof window === 'undefined') {
            return;
        }

        window.requestAnimationFrame(() => {
            if (visualStageRef.current) {
                resolveVisualPreviewCollisions(visualStageRef.current);
            }
        });
    }, []);

    const closeVisualWidgetDialog = useCallback(() => {
        setVisualWidgetDialog(null);
    }, []);

    const saveVisualWidgetDialog = useCallback(() => {
        if (!visualWidgetDialog) {
            return;
        }

        if (visualWidgetDialog === 'skill-icons' && skillWidgetDraft.selectedIds.length === 0 && !skillWidgetDraft.customIconDataUrl) {
            setError(intl.formatMessage({
                id: 'iuin_profile.visual_toolbox.skills_required',
                defaultMessage: 'Choose at least one skill or upload a custom icon.',
            }));
            return;
        }

        if (visualWidgetDialog === 'shields-badge' && !badgeWidgetDraft.value.trim()) {
            setError(intl.formatMessage({
                id: 'iuin_profile.visual_toolbox.badge_contact_required',
                defaultMessage: 'Enter the contact value for this badge.',
            }));
            return;
        }

        const widgetHtml = visualWidgetDialog === 'skill-icons' ? createSkillWidgetHtml(skillWidgetDraft) : createBadgeWidgetHtml(badgeWidgetDraft);
        updateHomepageHtml((html) => appendHtmlModule(html, widgetHtml));
        setError('');
        setVisualWidgetDialog(null);
        setActiveTab('preview');
        scheduleVisualPreviewLayoutResolve();
    }, [badgeWidgetDraft, intl, scheduleVisualPreviewLayoutResolve, skillWidgetDraft, updateHomepageHtml, visualWidgetDialog]);

    const toggleSkillWidgetOption = useCallback((skillId: string) => {
        setSkillWidgetDraft((previous) => ({
            ...previous,
            selectedIds: previous.selectedIds.includes(skillId) ? previous.selectedIds.filter((id) => id !== skillId) : [...previous.selectedIds, skillId],
        }));
        setError('');
    }, []);

    const setBadgePlatform = useCallback((platformId: string) => {
        const option = CONTACT_BADGE_OPTIONS.find((item) => item.id === platformId) || CONTACT_BADGE_OPTIONS[0];
        setBadgeWidgetDraft((previous) => ({
            ...previous,
            platformId,
            value: previous.value || option.defaultValue || (platformId === 'email' ? accountDraft.email || currentUser.email || '' : accountDraft.username || currentUser.username),
        }));
        setError('');
    }, [accountDraft.email, accountDraft.username, currentUser.email, currentUser.username]);

    const handleSkillIconUpload = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) {
            return;
        }

        if (!isSupportedVisualUpload(file)) {
            setError(intl.formatMessage({
                id: 'iuin_profile.visual_toolbox.upload_type_error',
                defaultMessage: 'Upload a PNG, JPG, GIF, or WebP image.',
            }));
            return;
        }

        if (file.size > MAX_STATUS_MEDIA_SIZE) {
            setError(intl.formatMessage({
                id: 'iuin_profile.editor.image_size',
                defaultMessage: 'Please keep status images under 2 MB.',
            }));
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            setSkillWidgetDraft((previous) => ({
                ...previous,
                customIconDataUrl: String(reader.result || ''),
                customIconName: file.name,
            }));
            setError('');
        };
        reader.readAsDataURL(file);
    }, [intl]);

    const handleBadgeIconUpload = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) {
            return;
        }

        if (!isSupportedVisualUpload(file)) {
            setError(intl.formatMessage({
                id: 'iuin_profile.visual_toolbox.upload_type_error',
                defaultMessage: 'Upload a PNG, JPG, GIF, or WebP image.',
            }));
            return;
        }

        if (file.size > MAX_STATUS_MEDIA_SIZE) {
            setError(intl.formatMessage({
                id: 'iuin_profile.editor.image_size',
                defaultMessage: 'Please keep status images under 2 MB.',
            }));
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            setBadgeWidgetDraft((previous) => ({
                ...previous,
                customIconDataUrl: String(reader.result || ''),
                customIconName: file.name,
            }));
            setError('');
        };
        reader.readAsDataURL(file);
    }, [intl]);

    const deleteVisualWidget = useCallback((widgetId: string) => {
        updateHomepageHtml((html) => deleteVisualWidgetHtml(html, widgetId));
        setVisualDeleteAnchor(null);
        setVisualDragState((previous) => (previous?.widgetId === widgetId ? null : previous));
        scheduleVisualPreviewLayoutResolve();
    }, [scheduleVisualPreviewLayoutResolve, updateHomepageHtml]);

    const updateVisualDeleteAnchorFromPointer = useCallback((stage: HTMLElement, target: HTMLElement | null, clientX: number, clientY: number) => {
        const widget = getVisualWidgetFromPointer(stage, target, clientX, clientY);
        setVisualDeleteAnchor(widget ? getVisualDeleteAnchor(stage, widget) : null);
    }, []);

    const handleVisualPreviewPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement | null;
        const widget = getVisualWidgetFromPointer(event.currentTarget, target, event.clientX, event.clientY);

        if (!widget || !event.currentTarget.contains(widget)) {
            return;
        }

        const widgetId = widget.getAttribute('data-iuin-widget-id');
        if (!widgetId) {
            return;
        }

        const widgetRect = widget.getBoundingClientRect();
        setVisualDragState({
            widgetId,
            pointerId: event.pointerId,
            offsetX: event.clientX - widgetRect.left,
            offsetY: event.clientY - widgetRect.top,
            width: widgetRect.width,
            height: widgetRect.height,
        });
        setVisualDeleteAnchor(getVisualDeleteAnchor(event.currentTarget, widget));
        event.currentTarget.setPointerCapture(event.pointerId);
        scheduleVisualPreviewLayoutResolve();
        event.preventDefault();
    }, [scheduleVisualPreviewLayoutResolve]);

    const handleVisualPreviewPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (!visualDragState || visualDragState.pointerId !== event.pointerId) {
            updateVisualDeleteAnchorFromPointer(event.currentTarget, event.target as HTMLElement | null, event.clientX, event.clientY);
            return;
        }

        const canvas = event.currentTarget.querySelector<HTMLElement>('.iuin-profile-rendered--preview');
        const canvasRect = canvas?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect();
        const stageRect = event.currentTarget.getBoundingClientRect();
        const rawLeft = event.clientX - canvasRect.left - visualDragState.offsetX;
        const rawTop = event.clientY - canvasRect.top - visualDragState.offsetY;
        const {left, top} = canvas ? getSnappedVisualPosition(rawLeft, rawTop, visualDragState, canvas, visualSnapEnabled) : {
            left: clampVisualPosition(rawLeft, 0, canvasRect.width - visualDragState.width),
            top: clampVisualPosition(rawTop, 0, canvasRect.height - visualDragState.height),
        };

        updateHomepageHtml((html) => updateVisualWidgetPosition(html, visualDragState.widgetId, left, top));
        setVisualDeleteAnchor({
            widgetId: visualDragState.widgetId,
            left: canvasRect.left - stageRect.left + left + visualDragState.width + VISUAL_DELETE_HANDLE_OFFSET,
            top: canvasRect.top - stageRect.top + top - VISUAL_DELETE_HANDLE_OFFSET,
        });
        scheduleVisualPreviewLayoutResolve();
        event.preventDefault();
    }, [scheduleVisualPreviewLayoutResolve, updateHomepageHtml, updateVisualDeleteAnchorFromPointer, visualDragState, visualSnapEnabled]);

    const stopVisualPreviewDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (!visualDragState || visualDragState.pointerId !== event.pointerId) {
            return;
        }

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }

        setVisualDragState(null);
        scheduleVisualPreviewLayoutResolve();
        event.preventDefault();
    }, [scheduleVisualPreviewLayoutResolve, visualDragState]);

    const handleVisualPreviewPointerLeave = useCallback(() => {
        if (!visualDragState) {
            setVisualDeleteAnchor(null);
        }
    }, [visualDragState]);

    const handleVisualPreviewClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement | null;
        const widget = target?.closest('[data-iuin-widget-id]');

        if (!widget || !event.currentTarget.contains(widget)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
    }, []);

    useEffect(() => {
        if (activeTab !== 'preview') {
            setVisualDragState(null);
        }
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'preview') {
            scheduleVisualPreviewLayoutResolve();
        }
    }, [activeTab, readmeHtml, scheduleVisualPreviewLayoutResolve]);

    const loadIuinSettings = useCallback(async () => {
        setSettingsLoading(true);
        setError('');

        try {
            const [settingsData, loadedSessions] = await Promise.all([
                fetchIuinProfileSettings(),
                Client4.getSessions(currentUser.id),
            ]);
            setSettings(settingsData);
            setSessions(loadedSessions);
        } catch (err) {
            setError(err instanceof Error ? err.message : intl.formatMessage({
                id: 'iuin_profile.settings.load_error',
                defaultMessage: 'Could not load account settings.',
            }));
        } finally {
            setSettingsLoading(false);
        }
    }, [currentUser.id, intl]);

    useEffect(() => {
        if (activeSection === 'account' || activeSection === 'security') {
            loadIuinSettings();
        }
    }, [activeSection, loadIuinSettings]);

    useEffect(() => {
        if (editorToasts.length === 0) {
            return undefined;
        }

        const hasErrorToast = editorToasts.some((toast) => toast.type === 'error');
        const timeoutId = window.setTimeout(() => {
            setNotice('');
            setError('');
            setPasswordMessage(null);
        }, hasErrorToast ? 5200 : 3600);

        return () => window.clearTimeout(timeoutId);
    }, [editorToasts]);

    const setAccountField = useCallback((field: keyof AccountDraft, value: string) => {
        setAccountDraft((previous) => ({
            ...previous,
            [field]: value,
        }));
        setAccountSaveState('idle');
        setNotice('');
    }, []);

    const setPasswordField = useCallback((field: keyof PasswordDraft, value: string) => {
        setPasswordDraft((previous) => ({
            ...previous,
            [field]: value,
        }));
        setSecuritySaveState('idle');
        setPasswordMessage(null);
        setError('');
        setNotice('');
    }, []);

    const setResearchFields = useCallback((fields: string[]) => {
        setField('researchFields', fields.join(', '));
    }, [setField]);

    const setHomepageSectionVisible = useCallback((sectionId: HomepageSectionId, visible: boolean) => {
        setField('sectionVisibility', serializeSectionVisibility({
            ...sectionVisibility,
            [sectionId]: visible,
        }));
    }, [sectionVisibility, setField]);

    const startAddingResearchField = useCallback(() => {
        setEditingResearchFieldIndex(researchFields.length);
        setResearchFieldDraft('');
    }, [researchFields.length]);

    const startEditingResearchField = useCallback((index: number) => {
        setEditingResearchFieldIndex(index);
        setResearchFieldDraft(researchFields[index] || '');
    }, [researchFields]);

    const cancelResearchFieldEdit = useCallback(() => {
        setEditingResearchFieldIndex(null);
        setResearchFieldDraft('');
    }, []);

    const commitResearchField = useCallback(() => {
        if (editingResearchFieldIndex === null) {
            return;
        }

        const value = researchFieldDraft.trim();
        if (!value) {
            cancelResearchFieldEdit();
            return;
        }

        const nextFields = [...researchFields];
        if (editingResearchFieldIndex >= nextFields.length) {
            nextFields.push(value);
        } else {
            nextFields[editingResearchFieldIndex] = value;
        }

        setResearchFields(nextFields);
        cancelResearchFieldEdit();
    }, [cancelResearchFieldEdit, editingResearchFieldIndex, researchFieldDraft, researchFields, setResearchFields]);

    const removeResearchField = useCallback((index: number) => {
        setResearchFields(researchFields.filter((_, fieldIndex) => fieldIndex !== index));
        setEditingResearchFieldIndex((previous) => {
            if (previous === null) {
                return null;
            }

            if (previous === index) {
                return null;
            }

            return previous > index ? previous - 1 : previous;
        });
        setResearchFieldDraft((previous) => (editingResearchFieldIndex === index ? '' : previous));
    }, [editingResearchFieldIndex, researchFields, setResearchFields]);

    const handleResearchFieldKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            commitResearchField();
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            cancelResearchFieldEdit();
        }
    }, [cancelResearchFieldEdit, commitResearchField]);

    const handleResearchFieldCardKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>, index: number) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            startEditingResearchField(index);
        }
    }, [startEditingResearchField]);

    const startAddingAcademicEntry = useCallback((sectionId: AcademicSectionId) => {
        setAcademicDialog({
            sectionId,
            index: null,
            draft: getEmptyAcademicEntry(),
        });
        setError('');
    }, []);

    const startEditingAcademicEntry = useCallback((sectionId: AcademicSectionId, index: number) => {
        setAcademicDialog({
            sectionId,
            index,
            draft: academicEntriesBySection[sectionId][index] || getEmptyAcademicEntry(),
        });
        setError('');
    }, [academicEntriesBySection]);

    const closeAcademicDialog = useCallback(() => {
        setAcademicDialog(null);
    }, []);

    const setAcademicDialogField = useCallback((field: keyof IuinAcademicEntry, value: string) => {
        setAcademicDialog((previous) => previous ? ({
            ...previous,
            draft: {
                ...previous.draft,
                [field]: value,
            },
        }) : previous);
    }, []);

    const saveAcademicEntry = useCallback(() => {
        if (!academicDialog) {
            return;
        }

        const nextEntry = {
            title: academicDialog.draft.title.trim(),
            subtitle: academicDialog.draft.subtitle.trim(),
            meta: academicDialog.draft.meta.trim(),
            link: academicDialog.draft.link.trim(),
        };

        if (!nextEntry.title) {
            setError(intl.formatMessage({
                id: 'iuin_profile.editor.academic_title_required',
                defaultMessage: 'Title is required.',
            }));
            return;
        }

        const nextEntries = [...academicEntriesBySection[academicDialog.sectionId]];
        if (academicDialog.index === null) {
            nextEntries.push(nextEntry);
        } else {
            nextEntries[academicDialog.index] = nextEntry;
        }

        setField(academicDialog.sectionId, serializeIuinAcademicEntries(nextEntries));
        setAcademicDialog(null);
        setError('');
    }, [academicDialog, academicEntriesBySection, intl, setField]);

    const removeAcademicEntry = useCallback((sectionId: AcademicSectionId, index: number) => {
        setField(sectionId, serializeIuinAcademicEntries(academicEntriesBySection[sectionId].filter((_, entryIndex) => entryIndex !== index)));
        setAcademicDialog((previous) => {
            if (!previous || previous.sectionId !== sectionId) {
                return previous;
            }

            if (previous.index === index) {
                return null;
            }

            if (previous.index !== null && previous.index > index) {
                return {
                    ...previous,
                    index: previous.index - 1,
                };
            }

            return previous;
        });
    }, [academicEntriesBySection, setField]);

    const handleSave = useCallback(async () => {
        setSaveState('saving');
        setError('');

        const result = await dispatch(updateMe(getProfilePatch(currentUser, draft)) as any) as any;
        if (result.error) {
            setSaveState('error');
            setError(result.error.message || intl.formatMessage({
                id: 'iuin_profile.editor.save_error',
                defaultMessage: 'Could not save profile.',
            }));
            return;
        }

        setSaveState('saved');
        getHistory().push(`/u/${currentUser.username}`);
    }, [currentUser, dispatch, draft, intl]);

    const handleAccountSave = useCallback(async () => {
        const nextEmail = accountDraft.email.trim();
        const emailChanged = nextEmail !== (currentUser.email || '');

        if (!accountDraft.username.trim()) {
            setError(intl.formatMessage({
                id: 'iuin_profile.account.username_required',
                defaultMessage: 'Username is required.',
            }));
            return;
        }

        if (emailChanged && !accountDraft.currentPassword) {
            setError(intl.formatMessage({
                id: 'iuin_profile.account.password_required',
                defaultMessage: 'Enter your current password to change email.',
            }));
            return;
        }

        setAccountSaveState('saving');
        setError('');
        setNotice('');

        const patch: Partial<UserProfile> & {password?: string} = {
            id: currentUser.id,
            username: accountDraft.username.trim(),
            first_name: accountDraft.firstName.trim(),
            last_name: accountDraft.lastName.trim(),
            nickname: accountDraft.nickname.trim(),
            position: accountDraft.position.trim(),
            locale: accountDraft.locale,
        };

        if (emailChanged) {
            patch.email = nextEmail;
            patch.password = accountDraft.currentPassword;
        }

        const result = await dispatch(updateMe(patch as Partial<UserProfile>) as any) as any;
        if (result.error) {
            setAccountSaveState('error');
            setError(result.error.message || intl.formatMessage({
                id: 'iuin_profile.account.save_error',
                defaultMessage: 'Could not save account settings.',
            }));
            return;
        }

        setAccountSaveState('saved');
        setAccountDraft(getAccountDraft(result.data || currentUser));
        setNotice(intl.formatMessage({
            id: 'iuin_profile.account.saved',
            defaultMessage: 'Account settings saved.',
        }));
        loadIuinSettings();
    }, [accountDraft, currentUser, dispatch, intl, loadIuinSettings]);

    const handlePasswordSave = useCallback(async () => {
        if (!settings?.security.can_change_password) {
            return;
        }

        if (!passwordDraft.currentPassword || !passwordDraft.newPassword || !passwordDraft.confirmPassword) {
            const message = intl.formatMessage({
                id: 'iuin_profile.security.password_required',
                defaultMessage: 'Enter your current password, new password, and confirmation.',
            });
            setSecuritySaveState('error');
            setPasswordMessage({type: 'error', text: message});
            setError(message);
            setNotice('');
            return;
        }

        if (passwordDraft.newPassword !== passwordDraft.confirmPassword) {
            const message = intl.formatMessage({
                id: 'iuin_profile.security.password_mismatch',
                defaultMessage: 'The new passwords do not match.',
            });
            setSecuritySaveState('error');
            setPasswordMessage({type: 'error', text: message});
            setError(message);
            setNotice('');
            return;
        }

        const {valid, error: passwordPolicyError} = isValidPassword(passwordDraft.newPassword, passwordConfig, intl);
        if (!valid) {
            const message = typeof passwordPolicyError === 'string' ? passwordPolicyError : intl.formatMessage({
                id: 'iuin_profile.security.password_policy_error',
                defaultMessage: 'Password does not meet the security requirements.',
            });
            setSecuritySaveState('error');
            setPasswordMessage({type: 'error', text: message});
            setError(message);
            setNotice('');
            return;
        }

        setSecuritySaveState('saving');
        setError('');
        setNotice('');
        setPasswordMessage(null);

        const result = await dispatch(updateUserPassword(currentUser.id, passwordDraft.currentPassword, passwordDraft.newPassword) as any) as any;
        if (result.error) {
            const message = result.error.message || intl.formatMessage({
                id: 'iuin_profile.security.password_save_error',
                defaultMessage: 'Could not update password.',
            });
            setSecuritySaveState('error');
            setPasswordMessage({type: 'error', text: message});
            setError(message);
            return;
        }

        const message = intl.formatMessage({
            id: 'iuin_profile.security.password_saved',
            defaultMessage: 'Password updated.',
        });
        setSecuritySaveState('saved');
        setPasswordDraft(getEmptyPasswordDraft());
        setPasswordMessage({type: 'success', text: message});
        setNotice(message);
    }, [currentUser.id, dispatch, intl, passwordConfig, passwordDraft, settings]);

    const handleRevokeSession = useCallback(async (sessionId: string) => {
        setSecuritySaveState('saving');
        setError('');
        setNotice('');

        const result = await dispatch(revokeSession(currentUser.id, sessionId) as any) as any;
        if (result.error) {
            setSecuritySaveState('error');
            setError(result.error.message || intl.formatMessage({
                id: 'iuin_profile.security.session_revoke_error',
                defaultMessage: 'Could not revoke session.',
            }));
            return;
        }

        setSecuritySaveState('saved');
        setNotice(intl.formatMessage({
            id: 'iuin_profile.security.session_revoked',
            defaultMessage: 'Session revoked.',
        }));
        loadIuinSettings();
    }, [currentUser.id, dispatch, intl, loadIuinSettings]);

    const handleRevokeOtherSessions = useCallback(async () => {
        setSecuritySaveState('saving');
        setError('');
        setNotice('');

        const results = await Promise.all(otherSessions.map((session) => dispatch(revokeSession(currentUser.id, session.id) as any) as any));
        const failedResult = results.find((result) => result.error);
        if (failedResult) {
            setSecuritySaveState('error');
            setError(failedResult.error.message || intl.formatMessage({
                id: 'iuin_profile.security.sessions_revoke_error',
                defaultMessage: 'Could not revoke all other sessions.',
            }));
            return;
        }

        setSecuritySaveState('saved');
        setNotice(intl.formatMessage({
            id: 'iuin_profile.security.sessions_revoked',
            defaultMessage: 'Other sessions revoked.',
        }));
        loadIuinSettings();
    }, [currentUser.id, dispatch, intl, loadIuinSettings, otherSessions]);

    const visualPreviewStageClassName = [
        'iuin-profile-visual-editor__stage',
        'iuin-profile-homepage-card__body',
        'iuin-profile-hui-card__content',
        'iuin-readme-workbench__preview-canvas',
        'iuin-profile-readme-home-preview',
        visualDragState ? 'iuin-profile-visual-editor__stage--dragging' : '',
        visualSnapEnabled ? 'iuin-profile-visual-editor__stage--snap' : '',
    ].filter(Boolean).join(' ');

    return (
        <main className='iuin-profile-page iuin-profile-page--editor'>
            <aside className='iuin-profile-settings-nav'>
                <section className='iuin-profile-editor-profile'>
                    <img
                        className='iuin-profile-editor-profile__avatar'
                        src={editorAvatarUrl}
                        alt={editorDisplayName}
                    />
                    <h1>{editorDisplayName}</h1>
                    <p className='iuin-profile-editor-profile__username'>{`@${accountDraft.username || currentUser.username}`}</p>
                    {editorPosition && (
                        <p className='iuin-profile-editor-profile__position'>{editorPosition}</p>
                    )}
                    <div className='iuin-profile-editor-profile__stats'>
                        <div>
                            <strong>{experienceEntries.length}</strong>
                            <span>
                                <FormattedMessage
                                    id='iuin_profile.experience'
                                    defaultMessage='Experience'
                                />
                            </span>
                        </div>
                        <div>
                            <strong>{educationEntries.length}</strong>
                            <span>
                                <FormattedMessage
                                    id='iuin_profile.education'
                                    defaultMessage='Education'
                                />
                            </span>
                        </div>
                        <div>
                            <strong>{paperEntries.length}</strong>
                            <span>
                                <FormattedMessage
                                    id='iuin_profile.papers'
                                    defaultMessage='Paper'
                                />
                            </span>
                        </div>
                        <div>
                            <strong>{awardEntries.length}</strong>
                            <span>
                                <FormattedMessage
                                    id='iuin_profile.awards'
                                    defaultMessage='Awards'
                                />
                            </span>
                        </div>
                    </div>
                </section>
                <p className='iuin-profile-editor-section-label'>
                    <FormattedMessage
                        id='iuin_profile.editor.sections'
                        defaultMessage='Edit sections'
                    />
                </p>
                <nav className='iuin-profile-settings-nav__channels'>
                    <button
                        type='button'
                        className={`iuin-profile-settings-nav__item${activeSection === 'homepage' ? ' active' : ''}`}
                        onClick={() => selectEditorSection('homepage')}
                    >
                        <i className='icon icon-home-variant-outline'/>
                        <span className='iuin-profile-settings-nav__copy'>
                            <strong>
                                <FormattedMessage
                                    id='iuin_profile.settings.homepage'
                                    defaultMessage='Homepage'
                                />
                            </strong>
                            <small>
                                <FormattedMessage
                                    id='iuin_profile.editor.homepage_nav_hint'
                                    defaultMessage='Summary and CV sections'
                                />
                            </small>
                        </span>
                    </button>
                    <button
                        type='button'
                        className={`iuin-profile-settings-nav__item${activeSection === 'advanced' ? ' active' : ''}`}
                        onClick={() => selectEditorSection('advanced')}
                    >
                        <i className='icon icon-cog-outline'/>
                        <span className='iuin-profile-settings-nav__copy'>
                            <strong>
                                <FormattedMessage
                                    id='iuin_profile.readme.advanced_settings'
                                    defaultMessage='Advanced settings'
                                />
                            </strong>
                            <small>
                                <FormattedMessage
                                    id='iuin_profile.editor.advanced_nav_hint'
                                    defaultMessage='README files and import'
                                />
                            </small>
                        </span>
                    </button>
                    <button
                        type='button'
                        className={`iuin-profile-settings-nav__item${activeSection === 'account' ? ' active' : ''}`}
                        onClick={() => selectEditorSection('account')}
                    >
                        <i className='icon icon-account-outline'/>
                        <span className='iuin-profile-settings-nav__copy'>
                            <strong>
                                <FormattedMessage
                                    id='iuin_profile.settings.account'
                                    defaultMessage='Account'
                                />
                            </strong>
                            <small>
                                <FormattedMessage
                                    id='iuin_profile.editor.account_nav_hint'
                                    defaultMessage='Name, title, language'
                                />
                            </small>
                        </span>
                    </button>
                    <button
                        type='button'
                        className={`iuin-profile-settings-nav__item${activeSection === 'security' ? ' active' : ''}`}
                        onClick={() => selectEditorSection('security')}
                    >
                        <i className='icon icon-lock-outline'/>
                        <span className='iuin-profile-settings-nav__copy'>
                            <strong>
                                <FormattedMessage
                                    id='iuin_profile.settings.security'
                                    defaultMessage='Security'
                                />
                            </strong>
                            <small>
                                <FormattedMessage
                                    id='iuin_profile.editor.security_nav_hint'
                                    defaultMessage='Password and sessions'
                                />
                            </small>
                        </span>
                    </button>
                </nav>
            </aside>
            <section className='iuin-profile-editor'>
                <div className='iuin-profile-editor__header'>
                    <div>
                        <p className='iuin-profile-main__eyebrow'>
                            {getEditorSectionEyebrow(activeSection)}
                        </p>
                        <h1>
                            {getEditorSectionTitle(activeSection)}
                        </h1>
                    </div>
                    <div className='iuin-profile-editor__actions'>
                        <button
                            type='button'
                            className='iuin-profile-button iuin-profile-button--subtle'
                            onClick={() => getHistory().push(`/u/${currentUser.username}`)}
                        >
                            <FormattedMessage
                                id='iuin_profile.editor.cancel'
                                defaultMessage='Cancel'
                            />
                        </button>
                        {(activeSection === 'homepage' || activeSection === 'advanced') && (
                            <button
                                type='button'
                                className='iuin-profile-button'
                                disabled={saveState === 'saving'}
                                onClick={handleSave}
                            >
                                {getProfileSaveMessage(saveState === 'saving')}
                            </button>
                        )}
                    </div>
                </div>

                {activeSection === 'homepage' && (
                    <>
                        <section className='iuin-profile-editor__settings-section iuin-profile-editor__settings-section--fields'>
                            <div className='iuin-profile-editor__section-copy'>
                                <h2>
                                    <FormattedMessage
                                        id='iuin_profile.editor.fields'
                                        defaultMessage='Research fields'
                                    />
                                </h2>
                                <p>
                                    <FormattedMessage
                                        id='iuin_profile.editor.fields_hint'
                                        defaultMessage='Show the research areas that should appear near the top of your academic profile.'
                                    />
                                </p>
                            </div>
                            <div className='iuin-profile-editor__section-control'>
                                <label className='iuin-profile-section-toggle'>
                                    <input
                                        type='checkbox'
                                        checked={sectionVisibility.researchFields}
                                        onChange={(event) => setHomepageSectionVisible('researchFields', event.target.checked)}
                                    />
                                    <span className='iuin-profile-section-toggle__track'/>
                                    <span className='iuin-profile-section-toggle__copy'>
                                        <strong>
                                            <FormattedMessage
                                                id='iuin_profile.editor.section_show_on_homepage'
                                                defaultMessage='Show on homepage'
                                            />
                                        </strong>
                                    </span>
                                </label>
                                <div className='iuin-profile-editor__field-builder'>
                                    <span>
                                        <FormattedMessage
                                            id='iuin_profile.editor.fields'
                                            defaultMessage='Research fields'
                                        />
                                    </span>
                                    <div className='iuin-profile-editor__field-cards'>
                                        {researchFields.map((field, index) => (
                                            editingResearchFieldIndex === index ? (
                                                <div
                                                    key={`${field}-${index}-editing`}
                                                    className='iuin-profile-editor__field-card iuin-profile-editor__field-card--editing'
                                                >
                                                    <input
                                                        autoFocus={true}
                                                        value={researchFieldDraft}
                                                        onBlur={commitResearchField}
                                                        onChange={(event) => setResearchFieldDraft(event.target.value)}
                                                        onKeyDown={handleResearchFieldKeyDown}
                                                        placeholder={intl.formatMessage({
                                                            id: 'iuin_profile.editor.fields_card_placeholder',
                                                            defaultMessage: 'Research direction',
                                                        })}
                                                    />
                                                </div>
                                            ) : (
                                                <div
                                                    key={`${field}-${index}`}
                                                    className='iuin-profile-editor__field-card'
                                                    role='button'
                                                    tabIndex={0}
                                                    onClick={() => startEditingResearchField(index)}
                                                    onKeyDown={(event) => handleResearchFieldCardKeyDown(event, index)}
                                                >
                                                    <span>{field}</span>
                                                    <button
                                                        type='button'
                                                        className='iuin-profile-editor__field-remove'
                                                        aria-label={intl.formatMessage({
                                                            id: 'iuin_profile.editor.fields_remove',
                                                            defaultMessage: 'Remove research field',
                                                        })}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            removeResearchField(index);
                                                        }}
                                                    >
                                                        <span aria-hidden={true}>{'×'}</span>
                                                    </button>
                                                </div>
                                            )
                                        ))}
                                        {editingResearchFieldIndex === researchFields.length ? (
                                            <div className='iuin-profile-editor__field-card iuin-profile-editor__field-card--editing'>
                                                <input
                                                    autoFocus={true}
                                                    value={researchFieldDraft}
                                                    onBlur={commitResearchField}
                                                    onChange={(event) => setResearchFieldDraft(event.target.value)}
                                                    onKeyDown={handleResearchFieldKeyDown}
                                                    placeholder={intl.formatMessage({
                                                        id: 'iuin_profile.editor.fields_card_placeholder',
                                                        defaultMessage: 'Research direction',
                                                    })}
                                                />
                                            </div>
                                        ) : (
                                            <button
                                                type='button'
                                                className='iuin-profile-editor__field-add'
                                                aria-label={intl.formatMessage({
                                                    id: 'iuin_profile.editor.fields_add',
                                                    defaultMessage: 'Add research field',
                                                })}
                                                onClick={startAddingResearchField}
                                            >
                                                <span aria-hidden={true}>{'+'}</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className='iuin-profile-editor__settings-section iuin-profile-editor__settings-section--summary'>
                            <div className='iuin-profile-editor__section-copy'>
                                <h2>
                                    <FormattedMessage
                                        id='iuin_profile.professional_summary'
                                        defaultMessage='Professional Summary'
                                    />
                                </h2>
                                <p>
                                    <FormattedMessage
                                        id='iuin_profile.editor.summary_hint'
                                        defaultMessage='Edit README.md, the Markdown source rendered on your personal homepage.'
                                    />
                                </p>
                            </div>
                            <div className='iuin-profile-editor__section-control iuin-profile-editor__summary-panel'>
                                <div className='iuin-profile-editor__summary-toolbar'>
                                    <label className='iuin-profile-section-toggle'>
                                        <input
                                            type='checkbox'
                                            checked={sectionVisibility.summary}
                                            onChange={(event) => setHomepageSectionVisible('summary', event.target.checked)}
                                        />
                                        <span className='iuin-profile-section-toggle__track'/>
                                        <span className='iuin-profile-section-toggle__copy'>
                                            <strong>
                                                <FormattedMessage
                                                    id='iuin_profile.editor.section_show_on_homepage'
                                                    defaultMessage='Show on homepage'
                                                />
                                            </strong>
                                        </span>
                                    </label>
                                    <div className='iuin-profile-editor__tabs'>
                                        <button
                                            type='button'
                                            className={activeTab === 'code' ? 'active' : ''}
                                            onClick={() => setActiveTab('code')}
                                        >
                                            <FormattedMessage
                                                id='iuin_profile.editor.code'
                                                defaultMessage='Code'
                                            />
                                        </button>
                                        <button
                                            type='button'
                                            className={activeTab === 'preview' ? 'active' : ''}
                                            onClick={() => setActiveTab('preview')}
                                        >
                                            <FormattedMessage
                                                id='iuin_profile.editor.preview'
                                                defaultMessage='Preview'
                                            />
                                        </button>
                                    </div>
                                    <button
                                        type='button'
                                        className='iuin-profile-readme-entry-button'
                                        onClick={() => selectEditorSection('advanced')}
                                    >
                                        <i className='icon icon-folder-outline'/>
                                        <span>
                                            <FormattedMessage
                                                id='iuin_profile.readme.advanced_settings'
                                                defaultMessage='Advanced settings'
                                            />
                                        </span>
                                    </button>
                                </div>
                                {activeTab === 'code' && (
                                    <HtmlCodeEditor
                                        value={readmeContent}
                                        onChange={setMainReadmeContent}
                                    />
                                )}
                                {activeTab === 'preview' && (
                                    <div className='iuin-profile-visual-editor iuin-profile-display'>
                                        <div
                                            ref={visualStageRef}
                                            className={visualPreviewStageClassName}
                                            onPointerDown={handleVisualPreviewPointerDown}
                                            onPointerMove={handleVisualPreviewPointerMove}
                                            onPointerUp={stopVisualPreviewDrag}
                                            onPointerCancel={stopVisualPreviewDrag}
                                            onPointerLeave={handleVisualPreviewPointerLeave}
                                            onClickCapture={handleVisualPreviewClickCapture}
                                        >
                                            <article
                                                className='iuin-profile-rendered iuin-readme-workbench__preview-body iuin-profile-rendered--preview'
                                                dangerouslySetInnerHTML={{__html: readmeHtml}}
                                            />
                                            {visualDeleteAnchor && (
                                                <button
                                                    type='button'
                                                    className='iuin-profile-visual-editor__delete'
                                                    style={{
                                                        left: visualDeleteAnchor.left,
                                                        top: visualDeleteAnchor.top,
                                                    }}
                                                    aria-label={intl.formatMessage({
                                                        id: 'iuin_profile.visual_toolbox.delete_widget',
                                                        defaultMessage: 'Delete widget',
                                                    })}
                                                    onPointerDown={(event) => event.stopPropagation()}
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        deleteVisualWidget(visualDeleteAnchor.widgetId);
                                                    }}
                                                >
                                                    <span aria-hidden={true}>{'×'}</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        {visualWidgetDialog && typeof document !== 'undefined' && createPortal((
                            <div className='iuin-profile-widget-dialog__backdrop'>
                                <section
                                    className='iuin-profile-widget-dialog'
                                    role='dialog'
                                    aria-modal='true'
                                    aria-labelledby='iuin-profile-widget-dialog-title'
                                >
                                    <div className='iuin-profile-widget-dialog__header'>
                                        <div>
                                            <span>
                                                <FormattedMessage
                                                    id='iuin_profile.visual_toolbox.title'
                                                    defaultMessage='Toolbox'
                                                />
                                            </span>
                                            <h2 id='iuin-profile-widget-dialog-title'>
                                                {visualWidgetDialog === 'skill-icons' ? (
                                                    <FormattedMessage
                                                        id='iuin_profile.visual_toolbox.configure_skills'
                                                        defaultMessage='Configure skill icons'
                                                    />
                                                ) : (
                                                    <FormattedMessage
                                                        id='iuin_profile.visual_toolbox.configure_badge'
                                                        defaultMessage='Configure badge'
                                                    />
                                                )}
                                            </h2>
                                        </div>
                                        <button
                                            type='button'
                                            className='iuin-profile-widget-dialog__close'
                                            aria-label={intl.formatMessage({
                                                id: 'iuin_profile.editor.section_dialog_close',
                                                defaultMessage: 'Close dialog',
                                            })}
                                            onClick={closeVisualWidgetDialog}
                                        >
                                            <i className='icon icon-close'/>
                                        </button>
                                    </div>
                                    {visualWidgetDialog === 'skill-icons' ? (
                                        <div className='iuin-profile-widget-dialog__body'>
                                            <div className='iuin-profile-widget-dialog__skill-grid'>
                                                {SKILL_ICON_OPTIONS.map((skill) => (
                                                    <label
                                                        key={skill.id}
                                                        className={`iuin-profile-widget-dialog__choice${skillWidgetDraft.selectedIds.includes(skill.id) ? ' active' : ''}`}
                                                    >
                                                        <input
                                                            type='checkbox'
                                                            checked={skillWidgetDraft.selectedIds.includes(skill.id)}
                                                            onChange={() => toggleSkillWidgetOption(skill.id)}
                                                        />
                                                        <span>{skill.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                            <label className='iuin-profile-widget-dialog__upload'>
                                                <span>
                                                    <FormattedMessage
                                                        id='iuin_profile.visual_toolbox.custom_skill_icon'
                                                        defaultMessage='Upload custom icon'
                                                    />
                                                </span>
                                                <input
                                                    type='file'
                                                    accept='image/png,image/jpeg,image/gif,image/webp'
                                                    onChange={handleSkillIconUpload}
                                                />
                                                {skillWidgetDraft.customIconName && <strong>{skillWidgetDraft.customIconName}</strong>}
                                            </label>
                                        </div>
                                    ) : (
                                        <div className='iuin-profile-widget-dialog__body'>
                                            <div className='iuin-profile-widget-dialog__badge-options'>
                                                {CONTACT_BADGE_OPTIONS.map((option) => (
                                                    <button
                                                        type='button'
                                                        key={option.id}
                                                        className={`iuin-profile-widget-dialog__choice${badgeWidgetDraft.platformId === option.id ? ' active' : ''}`}
                                                        onClick={() => setBadgePlatform(option.id)}
                                                    >
                                                        <span>{option.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <label className='iuin-profile-widget-dialog__field'>
                                                <span>
                                                    <FormattedMessage
                                                        id='iuin_profile.visual_toolbox.contact_value'
                                                        defaultMessage='Contact value'
                                                    />
                                                </span>
                                                <input
                                                    value={badgeWidgetDraft.value}
                                                    onChange={(event) => {
                                                        setBadgeWidgetDraft((previous) => ({
                                                            ...previous,
                                                            value: event.target.value,
                                                        }));
                                                        setError('');
                                                    }}
                                                    placeholder={(CONTACT_BADGE_OPTIONS.find((option) => option.id === badgeWidgetDraft.platformId) || CONTACT_BADGE_OPTIONS[0]).placeholder}
                                                />
                                            </label>
                                            <label className='iuin-profile-widget-dialog__upload'>
                                                <span>
                                                    <FormattedMessage
                                                        id='iuin_profile.visual_toolbox.custom_badge_icon'
                                                        defaultMessage='Upload custom icon'
                                                    />
                                                </span>
                                                <input
                                                    type='file'
                                                    accept='image/png,image/jpeg,image/gif,image/webp'
                                                    onChange={handleBadgeIconUpload}
                                                />
                                                {badgeWidgetDraft.customIconName && <strong>{badgeWidgetDraft.customIconName}</strong>}
                                            </label>
                                        </div>
                                    )}
                                    <div className='iuin-profile-widget-dialog__actions'>
                                        <button
                                            type='button'
                                            className='iuin-profile-button iuin-profile-button--subtle'
                                            onClick={closeVisualWidgetDialog}
                                        >
                                            <FormattedMessage
                                                id='iuin_profile.editor.cancel'
                                                defaultMessage='Cancel'
                                            />
                                        </button>
                                        <button
                                            type='button'
                                            className='iuin-profile-button'
                                            onClick={saveVisualWidgetDialog}
                                        >
                                            <FormattedMessage
                                                id='iuin_profile.visual_toolbox.add_to_preview'
                                                defaultMessage='Add to preview'
                                            />
                                        </button>
                                    </div>
                                </section>
                            </div>
                        ), document.body)}

                        {ACADEMIC_SECTION_CONFIGS.map((config) => {
                            const entries = academicEntriesBySection[config.id];
                            const managerClassName = `iuin-profile-editor__section-control iuin-profile-academic-manager iuin-profile-academic-manager--${config.id}`;

                            return (
                                <section
                                    key={config.id}
                                    className='iuin-profile-editor__settings-section iuin-profile-editor__settings-section--academic'
                                >
                                    <div className='iuin-profile-editor__section-copy'>
                                        <h2>
                                            <FormattedMessage
                                                id={config.titleId}
                                                defaultMessage={config.defaultTitle}
                                            />
                                        </h2>
                                        <p>
                                            <FormattedMessage
                                                id={config.descriptionId}
                                                defaultMessage={config.defaultDescription}
                                            />
                                        </p>
                                    </div>
                                    <div className={managerClassName}>
                                        <div className='iuin-profile-academic-manager__toolbar'>
                                            <label className='iuin-profile-section-toggle'>
                                                <input
                                                    type='checkbox'
                                                    checked={sectionVisibility[config.id]}
                                                    onChange={(event) => setHomepageSectionVisible(config.id, event.target.checked)}
                                                />
                                                <span className='iuin-profile-section-toggle__track'/>
                                                <span className='iuin-profile-section-toggle__copy'>
                                                    <strong>
                                                        <FormattedMessage
                                                            id='iuin_profile.editor.section_show_on_homepage'
                                                            defaultMessage='Show on homepage'
                                                        />
                                                    </strong>
                                                </span>
                                            </label>
                                            <button
                                                type='button'
                                                className='iuin-profile-button'
                                                onClick={() => startAddingAcademicEntry(config.id)}
                                            >
                                                <i className='icon icon-plus'/>
                                                <FormattedMessage
                                                    id='iuin_profile.editor.section_add'
                                                    defaultMessage='Add'
                                                />
                                            </button>
                                        </div>
                                        {entries.length > 0 ? (
                                            <div className='iuin-profile-academic-manager__cards'>
                                                {entries.map((entry, index) => {
                                                    const safeLink = getSafeAcademicLink(entry.link);
                                                    const detail = safeLink ? '' : entry.link;

                                                    return (
                                                        <article
                                                            key={`${entry.title}-${entry.subtitle}-${entry.meta}-${index}`}
                                                            className='iuin-profile-academic-manager__card'
                                                        >
                                                            <span className='iuin-profile-academic-manager__icon'>
                                                                <i className={`icon ${config.icon}`}/>
                                                            </span>
                                                            <div className='iuin-profile-academic-manager__card-copy'>
                                                                <h3>{getAcademicEntryHeading(entry)}</h3>
                                                                {entry.meta && <span>{entry.meta}</span>}
                                                                {detail && <p>{detail}</p>}
                                                            </div>
                                                            <div className='iuin-profile-academic-manager__card-actions'>
                                                                <button
                                                                    type='button'
                                                                    aria-label={intl.formatMessage({
                                                                        id: 'iuin_profile.editor.section_entry_edit',
                                                                        defaultMessage: 'Edit entry',
                                                                    })}
                                                                    title={intl.formatMessage({
                                                                        id: 'iuin_profile.editor.section_entry_edit',
                                                                        defaultMessage: 'Edit entry',
                                                                    })}
                                                                    onClick={() => startEditingAcademicEntry(config.id, index)}
                                                                >
                                                                    <i className='icon icon-pencil-outline'/>
                                                                </button>
                                                                <button
                                                                    type='button'
                                                                    aria-label={intl.formatMessage({
                                                                        id: 'iuin_profile.editor.section_entry_delete',
                                                                        defaultMessage: 'Delete entry',
                                                                    })}
                                                                    title={intl.formatMessage({
                                                                        id: 'iuin_profile.editor.section_entry_delete',
                                                                        defaultMessage: 'Delete entry',
                                                                    })}
                                                                    onClick={() => removeAcademicEntry(config.id, index)}
                                                                >
                                                                    <i className='icon icon-trash-can-outline'/>
                                                                </button>
                                                            </div>
                                                        </article>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className='iuin-profile-academic-manager__empty'>
                                                <i className={`icon ${config.icon}`}/>
                                                <span>
                                                    <FormattedMessage
                                                        id={config.emptyId}
                                                        defaultMessage={config.defaultEmpty}
                                                    />
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            );
                        })}

                        {academicDialog && (() => {
                            const config = ACADEMIC_SECTION_CONFIGS.find((section) => section.id === academicDialog.sectionId);
                            if (!config) {
                                return null;
                            }

                            if (typeof document === 'undefined') {
                                return null;
                            }

                            return createPortal((
                                <div className='iuin-profile-entry-dialog__backdrop'>
                                    <section
                                        className='iuin-profile-entry-dialog'
                                        role='dialog'
                                        aria-modal='true'
                                        aria-labelledby='iuin-profile-entry-dialog-title'
                                    >
                                        <div className='iuin-profile-entry-dialog__header'>
                                            <div>
                                                <span>
                                                    <FormattedMessage
                                                        id={config.titleId}
                                                        defaultMessage={config.defaultTitle}
                                                    />
                                                </span>
                                                <h2 id='iuin-profile-entry-dialog-title'>
                                                    {academicDialog.index === null ? (
                                                        <FormattedMessage
                                                            id='iuin_profile.editor.section_entry_add'
                                                            defaultMessage='Add entry'
                                                        />
                                                    ) : (
                                                        <FormattedMessage
                                                            id='iuin_profile.editor.section_entry_edit'
                                                            defaultMessage='Edit entry'
                                                        />
                                                    )}
                                                </h2>
                                            </div>
                                            <button
                                                type='button'
                                                className='iuin-profile-entry-dialog__close'
                                                aria-label={intl.formatMessage({
                                                    id: 'iuin_profile.editor.section_dialog_close',
                                                    defaultMessage: 'Close dialog',
                                                })}
                                                onClick={closeAcademicDialog}
                                            >
                                                <i className='icon icon-close'/>
                                            </button>
                                        </div>
                                        <div className='iuin-profile-entry-dialog__form'>
                                            <label>
                                                <span>
                                                    <FormattedMessage
                                                        id={config.titleLabelId}
                                                        defaultMessage={config.defaultTitleLabel}
                                                    />
                                                </span>
                                                <input
                                                    autoFocus={true}
                                                    value={academicDialog.draft.title}
                                                    onChange={(event) => setAcademicDialogField('title', event.target.value)}
                                                    placeholder={config.titlePlaceholder}
                                                />
                                            </label>
                                            <label>
                                                <span>
                                                    <FormattedMessage
                                                        id={config.subtitleLabelId}
                                                        defaultMessage={config.defaultSubtitleLabel}
                                                    />
                                                </span>
                                                <input
                                                    value={academicDialog.draft.subtitle}
                                                    onChange={(event) => setAcademicDialogField('subtitle', event.target.value)}
                                                    placeholder={config.subtitlePlaceholder}
                                                />
                                            </label>
                                            <label>
                                                <span>
                                                    <FormattedMessage
                                                        id={config.metaLabelId}
                                                        defaultMessage={config.defaultMetaLabel}
                                                    />
                                                </span>
                                                <input
                                                    value={academicDialog.draft.meta}
                                                    onChange={(event) => setAcademicDialogField('meta', event.target.value)}
                                                    placeholder={config.metaPlaceholder}
                                                />
                                            </label>
                                            <label>
                                                <span>
                                                    <FormattedMessage
                                                        id={config.detailLabelId}
                                                        defaultMessage={config.defaultDetailLabel}
                                                    />
                                                </span>
                                                <textarea
                                                    value={academicDialog.draft.link}
                                                    onChange={(event) => setAcademicDialogField('link', event.target.value)}
                                                    placeholder={config.detailPlaceholder}
                                                />
                                            </label>
                                        </div>
                                        <div className='iuin-profile-entry-dialog__actions'>
                                            <button
                                                type='button'
                                                className='iuin-profile-button iuin-profile-button--subtle'
                                                onClick={closeAcademicDialog}
                                            >
                                                <FormattedMessage
                                                    id='iuin_profile.editor.cancel'
                                                    defaultMessage='Cancel'
                                                />
                                            </button>
                                            <button
                                                type='button'
                                                className='iuin-profile-button'
                                                onClick={saveAcademicEntry}
                                            >
                                                <FormattedMessage
                                                    id='iuin_profile.editor.save_entry'
                                                    defaultMessage='Save'
                                                />
                                            </button>
                                        </div>
                                    </section>
                                </div>
                            ), document.body);
                        })()}
                    </>
                )}
                {activeSection === 'advanced' && (
                    <div className='iuin-profile-editor__advanced-workbench'>
                        <IuinReadmeAdvancedEditor
                            currentUser={currentUser}
                            embedded={true}
                            draft={draft}
                            setDraft={setAdvancedDraft}
                            onClose={() => selectEditorSection('homepage')}
                        />
                    </div>
                )}
                {activeSection === 'account' && (
                    <section className='iuin-profile-card iuin-profile-editor__settings-panel'>
                        <div className='iuin-profile-editor__settings-grid'>
                            <label>
                                <span>
                                    <FormattedMessage
                                        id='iuin_profile.account.username'
                                        defaultMessage='Username'
                                    />
                                </span>
                                <input
                                    value={accountDraft.username}
                                    onChange={(event) => setAccountField('username', event.target.value)}
                                />
                            </label>
                            <label>
                                <span>
                                    <FormattedMessage
                                        id='iuin_profile.account.nickname'
                                        defaultMessage='Nickname'
                                    />
                                </span>
                                <input
                                    value={accountDraft.nickname}
                                    onChange={(event) => setAccountField('nickname', event.target.value)}
                                />
                            </label>
                            <label>
                                <span>
                                    <FormattedMessage
                                        id='iuin_profile.account.first_name'
                                        defaultMessage='First name'
                                    />
                                </span>
                                <input
                                    value={accountDraft.firstName}
                                    onChange={(event) => setAccountField('firstName', event.target.value)}
                                />
                            </label>
                            <label>
                                <span>
                                    <FormattedMessage
                                        id='iuin_profile.account.last_name'
                                        defaultMessage='Last name'
                                    />
                                </span>
                                <input
                                    value={accountDraft.lastName}
                                    onChange={(event) => setAccountField('lastName', event.target.value)}
                                />
                            </label>
                            <label>
                                <span>
                                    <FormattedMessage
                                        id='iuin_profile.account.position'
                                        defaultMessage='Position'
                                    />
                                </span>
                                <input
                                    value={accountDraft.position}
                                    onChange={(event) => setAccountField('position', event.target.value)}
                                />
                            </label>
                            <label>
                                <span>
                                    <FormattedMessage
                                        id='iuin_profile.account.locale'
                                        defaultMessage='Language'
                                    />
                                </span>
                                <select
                                    value={accountDraft.locale}
                                    onChange={(event) => setAccountField('locale', event.target.value)}
                                >
                                    {ACCOUNT_LOCALES.map((locale) => (
                                        <option
                                            key={locale.value || 'default'}
                                            value={locale.value}
                                        >
                                            {intl.formatMessage({
                                                id: locale.id,
                                                defaultMessage: locale.defaultMessage,
                                            })}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className='iuin-profile-editor__settings-grid-full'>
                                <span>
                                    <FormattedMessage
                                        id='iuin_profile.account.email'
                                        defaultMessage='Email'
                                    />
                                </span>
                                <input
                                    type='email'
                                    value={accountDraft.email}
                                    onChange={(event) => setAccountField('email', event.target.value)}
                                />
                            </label>
                            {accountDraft.email.trim() !== (currentUser.email || '') && (
                                <label className='iuin-profile-editor__settings-grid-full'>
                                    <span>
                                        <FormattedMessage
                                            id='iuin_profile.account.current_password'
                                            defaultMessage='Current password'
                                        />
                                    </span>
                                    <input
                                        type='password'
                                        value={accountDraft.currentPassword}
                                        onChange={(event) => setAccountField('currentPassword', event.target.value)}
                                    />
                                </label>
                            )}
                        </div>
                        <div className='iuin-profile-editor__settings-actions'>
                            <button
                                type='button'
                                className='iuin-profile-button'
                                disabled={accountSaveState === 'saving'}
                                onClick={handleAccountSave}
                            >
                                {accountSaveState === 'saving' ? (
                                    <FormattedMessage
                                        id='iuin_profile.editor.saving'
                                        defaultMessage='Saving...'
                                    />
                                ) : (
                                    <FormattedMessage
                                        id='iuin_profile.account.save'
                                        defaultMessage='Save account'
                                    />
                                )}
                            </button>
                        </div>
                    </section>
                )}

                {activeSection === 'security' && (
                    <>
                        <section className='iuin-profile-card iuin-profile-editor__security-summary'>
                            <div>
                                <span>
                                    <FormattedMessage
                                        id='iuin_profile.security.sign_in_method'
                                        defaultMessage='Sign-in method'
                                    />
                                </span>
                                <strong>{getAuthServiceLabel(settings?.security.auth_service || currentUser.auth_service || '')}</strong>
                            </div>
                            <div>
                                <span>
                                    <FormattedMessage
                                        id='iuin_profile.security.mfa'
                                        defaultMessage='Multi-factor authentication'
                                    />
                                </span>
                                <strong>
                                    {settings?.security.mfa_active ? (
                                        <FormattedMessage
                                            id='iuin_profile.security.enabled'
                                            defaultMessage='Enabled'
                                        />
                                    ) : (
                                        <FormattedMessage
                                            id='iuin_profile.security.disabled'
                                            defaultMessage='Disabled'
                                        />
                                    )}
                                </strong>
                            </div>
                            <div>
                                <span>
                                    <FormattedMessage
                                        id='iuin_profile.security.sessions'
                                        defaultMessage='Active sessions'
                                    />
                                </span>
                                <strong>{settingsLoading ? '...' : (settings?.security.sessions_count ?? sessions.length)}</strong>
                            </div>
                        </section>
                        <section className='iuin-profile-card iuin-profile-editor__settings-panel iuin-profile-editor__settings-panel--password'>
                            <h2>
                                <FormattedMessage
                                    id='iuin_profile.security.password'
                                    defaultMessage='Password'
                                />
                            </h2>
                            {settings?.security.can_change_password ?? currentUser.auth_service === '' ? (
                                <div className='iuin-profile-editor__settings-grid iuin-profile-editor__password-grid'>
                                    <label>
                                        <span>
                                            <FormattedMessage
                                                id='iuin_profile.security.current_password'
                                                defaultMessage='Current password'
                                            />
                                        </span>
                                        <input
                                            type='password'
                                            autoComplete='current-password'
                                            value={passwordDraft.currentPassword}
                                            onChange={(event) => setPasswordField('currentPassword', event.target.value)}
                                        />
                                    </label>
                                    <label>
                                        <span>
                                            <FormattedMessage
                                                id='iuin_profile.security.new_password'
                                                defaultMessage='New password'
                                            />
                                        </span>
                                        <input
                                            type='password'
                                            autoComplete='new-password'
                                            value={passwordDraft.newPassword}
                                            onChange={(event) => setPasswordField('newPassword', event.target.value)}
                                        />
                                    </label>
                                    <label>
                                        <span>
                                            <FormattedMessage
                                                id='iuin_profile.security.confirm_password'
                                                defaultMessage='Confirm password'
                                            />
                                        </span>
                                        <input
                                            type='password'
                                            autoComplete='new-password'
                                            value={passwordDraft.confirmPassword}
                                            onChange={(event) => setPasswordField('confirmPassword', event.target.value)}
                                        />
                                    </label>
                                </div>
                            ) : (
                                <p className='iuin-profile-editor__muted'>
                                    <FormattedMessage
                                        id='iuin_profile.security.password_managed'
                                        defaultMessage='Password is managed by your sign-in provider.'
                                    />
                                </p>
                            )}
                            {(settings?.security.can_change_password ?? currentUser.auth_service === '') && (
                                <div className='iuin-profile-editor__settings-actions'>
                                    <button
                                        type='button'
                                        className='iuin-profile-button'
                                        disabled={securitySaveState === 'saving'}
                                        onClick={handlePasswordSave}
                                    >
                                        {securitySaveState === 'saving' ? (
                                            <FormattedMessage
                                                id='iuin_profile.editor.saving'
                                                defaultMessage='Saving...'
                                            />
                                        ) : (
                                            <FormattedMessage
                                                id='iuin_profile.security.update_password'
                                                defaultMessage='Update password'
                                            />
                                        )}
                                    </button>
                                </div>
                            )}
                        </section>
                        <section className='iuin-profile-card iuin-profile-editor__settings-panel'>
                            <div className='iuin-profile-editor__section-heading'>
                                <h2>
                                    <FormattedMessage
                                        id='iuin_profile.security.active_sessions'
                                        defaultMessage='Active sessions'
                                    />
                                </h2>
                                <button
                                    type='button'
                                    className='iuin-profile-button iuin-profile-button--subtle'
                                    disabled={securitySaveState === 'saving' || otherSessions.length === 0}
                                    onClick={handleRevokeOtherSessions}
                                >
                                    <FormattedMessage
                                        id='iuin_profile.security.revoke_other_sessions'
                                        defaultMessage='Log out other sessions'
                                    />
                                </button>
                            </div>
                            {otherSessions.length > 0 ? (
                                <div className='iuin-profile-editor__session-list'>
                                    {otherSessions.map((session) => (
                                        <div
                                            key={session.id}
                                            className='iuin-profile-editor__session-row'
                                        >
                                            <div>
                                                <strong>{getSessionDeviceLabel(session)}</strong>
                                                <span>{new Date(session.last_activity_at).toLocaleString()}</span>
                                            </div>
                                            <button
                                                type='button'
                                                className='iuin-profile-button iuin-profile-button--subtle'
                                                disabled={securitySaveState === 'saving'}
                                                onClick={() => handleRevokeSession(session.id)}
                                            >
                                                <FormattedMessage
                                                    id='iuin_profile.security.revoke_session'
                                                    defaultMessage='Log out'
                                                />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className='iuin-profile-editor__muted'>
                                    <FormattedMessage
                                        id='iuin_profile.security.no_other_sessions'
                                        defaultMessage='No other active sessions.'
                                    />
                                </p>
                            )}
                        </section>
                    </>
                )}

                {editorToasts.length > 0 && (
                    <div className='iuin-profile-editor__toast-stack'>
                        {editorToasts.map((toast) => (
                            <div
                                key={toast.id}
                                className={`iuin-profile-editor__toast iuin-profile-editor__toast--${toast.type}`}
                                role={toast.type === 'error' ? 'alert' : 'status'}
                                aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
                            >
                                <span
                                    className='iuin-profile-editor__toast-icon'
                                    aria-hidden='true'
                                >
                                    <i className={`icon ${toast.type === 'error' ? 'icon-alert-outline' : 'icon-check'}`}/>
                                </span>
                                <span className='iuin-profile-editor__toast-copy'>
                                    {toast.text}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}
