// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserProfile} from '@mattermost/types/users';
import marked from 'marked';

export const IUIN_PROFILE_PROPS = {
    homepageHtml: 'iuin_profile_homepage_html',
    readmeWorkspace: 'iuin_profile_readme_workspace',
    researchStatus: 'iuin_profile_research_status',
    statusMedia: 'iuin_profile_status_media',
    researchFields: 'iuin_profile_research_fields',
    researchChannels: 'iuin_profile_research_channels',
    experience: 'iuin_profile_experience',
    education: 'iuin_profile_education',
    papers: 'iuin_profile_papers',
    awards: 'iuin_profile_awards',
    sectionVisibility: 'iuin_profile_section_visibility',
};

export type IuinProfileData = {
    homepageHtml: string;
    readmeWorkspace: string;
    researchStatus: string;
    statusMedia: string;
    researchFields: string;
    researchChannels: string;
    experience: string;
    education: string;
    papers: string;
    awards: string;
    sectionVisibility: string;
};

export type IuinReadmeFile = {
    path: string;
    content: string;
    type: 'markdown' | 'text' | 'asset' | 'folder';
    updatedAt: number;
};

export type IuinReadmeWorkspace = {
    rootName: string;
    activePath: string;
    githubRenderedHtml?: string;
    files: IuinReadmeFile[];
};

export type IuinAcademicEntry = {
    title: string;
    subtitle: string;
    meta: string;
    link: string;
};

const allowedTags = new Set([
    'a',
    'article',
    'blockquote',
    'br',
    'button',
    'code',
    'del',
    'details',
    'div',
    'em',
    'figcaption',
    'figure',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'img',
    'kbd',
    'li',
    'ol',
    'p',
    'picture',
    'pre',
    'section',
    'source',
    'span',
    'strong',
    'sub',
    'summary',
    'sup',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'ul',
]);

export const IUIN_README_MAIN_FILE = 'README.md';

const allowedAttributes = new Set([
    'align',
    'aria-label',
    'alt',
    'class',
    'colspan',
    'data-iuin-widget',
    'data-iuin-widget-id',
    'data-canonical-src',
    'dir',
    'height',
    'href',
    'id',
    'itemprop',
    'media',
    'open',
    'rel',
    'role',
    'rowspan',
    'src',
    'srcset',
    'style',
    'target',
    'title',
    'type',
    'valign',
    'width',
]);

export function getDisplayName(user: UserProfile): string {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();

    return fullName || user.nickname || user.username;
}

export function getIuinProfileData(user?: UserProfile): IuinProfileData {
    const props = user?.props || {};
    const readmeContent = getDefaultReadmeMarkdown(user);

    return {
        homepageHtml: readmeContent,
        readmeWorkspace: serializeIuinReadmeWorkspace(parseIuinReadmeWorkspace('', readmeContent, getReadmeRootName(user))),
        researchStatus: props[IUIN_PROFILE_PROPS.researchStatus] || '',
        statusMedia: props[IUIN_PROFILE_PROPS.statusMedia] || '',
        researchFields: props[IUIN_PROFILE_PROPS.researchFields] || '',
        researchChannels: props[IUIN_PROFILE_PROPS.researchChannels] || '',
        experience: getStringProp(props, IUIN_PROFILE_PROPS.experience, ''),
        education: getStringProp(props, IUIN_PROFILE_PROPS.education, ''),
        papers: getStringProp(props, IUIN_PROFILE_PROPS.papers, ''),
        awards: getStringProp(props, IUIN_PROFILE_PROPS.awards, ''),
        sectionVisibility: props[IUIN_PROFILE_PROPS.sectionVisibility] || '',
    };
}

export function getProfilePatch(user: UserProfile, data: IuinProfileData): Partial<UserProfile> {
    return {
        id: user.id,
        props: {
            ...(user.props || {}),
            [IUIN_PROFILE_PROPS.homepageHtml]: '',
            [IUIN_PROFILE_PROPS.readmeWorkspace]: '',
            [IUIN_PROFILE_PROPS.researchStatus]: data.researchStatus,
            [IUIN_PROFILE_PROPS.statusMedia]: data.statusMedia,
            [IUIN_PROFILE_PROPS.researchFields]: data.researchFields,
            [IUIN_PROFILE_PROPS.researchChannels]: data.researchChannels,
            [IUIN_PROFILE_PROPS.experience]: data.experience,
            [IUIN_PROFILE_PROPS.education]: data.education,
            [IUIN_PROFILE_PROPS.papers]: data.papers,
            [IUIN_PROFILE_PROPS.awards]: data.awards,
            [IUIN_PROFILE_PROPS.sectionVisibility]: data.sectionVisibility,
        },
    };
}

export function getReadmeRootName(user?: UserProfile): string {
    return `${user?.username || 'profile'}-profile-readme`;
}

export function parseIuinReadmeWorkspace(value: string, fallbackReadme = '', rootName = 'profile-readme'): IuinReadmeWorkspace {
    const fallbackFile = getDefaultReadmeFile(fallbackReadme);

    try {
        const parsed = JSON.parse(value || '{}') as Partial<IuinReadmeWorkspace>;
        const files = migrateLegacyReadmeFolderPlaceholders(Array.isArray(parsed.files) ? parsed.files.
            map(normalizeReadmeFile).
            filter((file): file is IuinReadmeFile => Boolean(file?.path)) : []);
        const nextFiles = files.some((file) => file.path === IUIN_README_MAIN_FILE) ? files : [fallbackFile, ...files];
        const activePath = parsed.activePath && nextFiles.some((file) => file.path === parsed.activePath && file.type !== 'folder') ? parsed.activePath : IUIN_README_MAIN_FILE;

        return {
            rootName: sanitizeReadmePath(parsed.rootName || rootName || 'profile-readme').replace(/\//g, '-') || 'profile-readme',
            activePath,
            githubRenderedHtml: typeof parsed.githubRenderedHtml === 'string' ? parsed.githubRenderedHtml : '',
            files: nextFiles,
        };
    } catch {
        return {
            rootName: sanitizeReadmePath(rootName || 'profile-readme').replace(/\//g, '-') || 'profile-readme',
            activePath: IUIN_README_MAIN_FILE,
            files: [fallbackFile],
        };
    }
}

export function serializeIuinReadmeWorkspace(workspace: IuinReadmeWorkspace): string {
    const files = migrateLegacyReadmeFolderPlaceholders(workspace.files.
        map(normalizeReadmeFile).
        filter((file): file is IuinReadmeFile => Boolean(file?.path)));
    const normalized = {
        rootName: sanitizeReadmePath(workspace.rootName || 'profile-readme').replace(/\//g, '-') || 'profile-readme',
        activePath: files.some((file) => file.path === workspace.activePath && file.type !== 'folder') ? workspace.activePath : IUIN_README_MAIN_FILE,
        githubRenderedHtml: typeof workspace.githubRenderedHtml === 'string' ? workspace.githubRenderedHtml : '',
        files: files.some((file) => file.path === IUIN_README_MAIN_FILE) ? files : [getDefaultReadmeFile(''), ...files],
    };

    return JSON.stringify(normalized);
}

export function getReadmeFileContent(workspace: IuinReadmeWorkspace, path = IUIN_README_MAIN_FILE): string {
    return workspace.files.find((file) => file.path === path)?.content || '';
}

export function setReadmeFileContent(workspace: IuinReadmeWorkspace, path: string, content: string, type?: IuinReadmeFile['type']): IuinReadmeWorkspace {
    const nextPath = sanitizeReadmePath(path) || IUIN_README_MAIN_FILE;
    const existing = workspace.files.find((file) => file.path === nextPath);

    return {
        ...workspace,
        activePath: nextPath,
        githubRenderedHtml: nextPath === IUIN_README_MAIN_FILE ? '' : workspace.githubRenderedHtml,
        files: upsertReadmeFile(workspace.files, {
            path: nextPath,
            content,
            type: type || existing?.type || getReadmeFileType(nextPath, content),
            updatedAt: Date.now(),
        }),
    };
}

export function removeReadmeFile(workspace: IuinReadmeWorkspace, path: string): IuinReadmeWorkspace {
    if (path === IUIN_README_MAIN_FILE) {
        return workspace;
    }

    const files = workspace.files.filter((file) => file.path !== path);

    return {
        ...workspace,
        activePath: workspace.activePath === path ? IUIN_README_MAIN_FILE : workspace.activePath,
        files,
    };
}

export function renderIuinReadmeMarkdown(markdown: string): string {
    const html = marked(markdown || '', {
        breaks: true,
        gfm: true,
        sanitize: false,
    });

    return sanitizeIuinProfileHtml(html);
}

export function splitProfileList(value: string): string[] {
    return value.
        split(/[\n,;]+/).
        map((item) => item.trim()).
        filter(Boolean);
}

export function parseIuinAcademicEntries(value: string): IuinAcademicEntry[] {
    return value.
        split(/\n+/).
        map((item) => item.trim()).
        filter(Boolean).
        map((item) => {
            const [title = '', subtitle = '', meta = '', link = ''] = item.
                split('|').
                map((part) => part.trim());

            return {
                title,
                subtitle,
                meta,
                link,
            };
        }).
        filter((entry) => entry.title);
}

export function serializeIuinAcademicEntries(entries: IuinAcademicEntry[]): string {
    return entries.
        map((entry) => [
            entry.title.trim(),
            entry.subtitle.trim(),
            entry.meta.trim(),
            entry.link.trim(),
        ].join(' | ')).
        filter((entry) => entry.replace(/[| ]/g, '').length > 0).
        join('\n');
}

type JoinedChannelCandidate = {
    display_name?: string;
    name?: string;
    type?: string;
    delete_at?: number;
};

export function getJoinedChannelLabels(channels: JoinedChannelCandidate[]): string[] {
    const labels = channels.
        filter((channel) => (channel.type === 'O' || channel.type === 'P') && !channel.delete_at).
        map((channel) => (channel.display_name || channel.name || '').trim()).
        filter(Boolean).
        sort((a, b) => a.localeCompare(b));

    return Array.from(new Set(labels));
}

export function getJoinedChannelLabelsFromMemberships(
    channelsById: Record<string, JoinedChannelCandidate | undefined>,
    membershipsByChannelId: Record<string, unknown>,
): string[] {
    const joinedChannels = Object.keys(membershipsByChannelId || {}).
        map((channelId) => channelsById[channelId]).
        filter((channel): channel is JoinedChannelCandidate => Boolean(channel));

    return getJoinedChannelLabels(joinedChannels);
}

export function appendHtmlModule(html: string, moduleHtml: string): string {
    const trimmed = html.trim();

    if (!trimmed) {
        return moduleHtml.trim();
    }

    return `${trimmed}\n\n${moduleHtml.trim()}`;
}

export function getDefaultReadmeMarkdown(user?: UserProfile): string {
    const name = user ? escapeHtml(getDisplayName(user)) : 'IUIN Member';
    const title = user?.position ? escapeHtml(user.position) : 'Research member';

    return [
        `# ${name}`,
        '',
        `${name} is a ${title}. You can introduce research directions, projects, papers, awards, course materials, and useful links here.`,
    ].join('\n');
}

function getDefaultReadmeFile(content: string): IuinReadmeFile {
    return {
        path: IUIN_README_MAIN_FILE,
        content,
        type: 'markdown',
        updatedAt: Date.now(),
    };
}

function normalizeReadmeFile(file: Partial<IuinReadmeFile> | null | undefined): IuinReadmeFile | null {
    if (!file || typeof file.path !== 'string') {
        return null;
    }

    const path = sanitizeReadmePath(file.path);
    if (!path) {
        return null;
    }

    const content = typeof file.content === 'string' ? file.content : '';
    const type = file.type === 'asset' || file.type === 'text' || file.type === 'markdown' || file.type === 'folder' ? file.type : getReadmeFileType(path, content);

    return {
        path,
        content: type === 'folder' ? '' : type === 'markdown' ? normalizeLegacyReadmeMarkdown(content) : content,
        type,
        updatedAt: typeof file.updatedAt === 'number' ? file.updatedAt : Date.now(),
    };
}

function migrateLegacyReadmeFolderPlaceholders(files: IuinReadmeFile[]): IuinReadmeFile[] {
    const nextFiles: IuinReadmeFile[] = [];
    const folderPaths = new Set<string>();

    files.forEach((file) => {
        const match = file.path.match(/^new-folder\/README(?:-(\d+))?\.md$/i);
        if (match && file.type === 'markdown' && !file.content.trim()) {
            folderPaths.add(`new-folder${match[1] ? `-${match[1]}` : ''}`);
            return;
        }

        nextFiles.push(file);
    });

    folderPaths.forEach((folderPath) => {
        if (nextFiles.some((file) => file.path === folderPath)) {
            return;
        }

        nextFiles.push({
            path: folderPath,
            content: '',
            type: 'folder',
            updatedAt: Date.now(),
        });
    });

    return nextFiles;
}

function upsertReadmeFile(files: IuinReadmeFile[], nextFile: IuinReadmeFile): IuinReadmeFile[] {
    const nextPath = sanitizeReadmePath(nextFile.path);
    const normalizedFile = normalizeReadmeFile({
        ...nextFile,
        path: nextPath,
    });

    if (!normalizedFile) {
        return files;
    }

    const nextFiles = [...files];
    const index = nextFiles.findIndex((file) => file.path === normalizedFile.path);
    if (index >= 0) {
        nextFiles[index] = normalizedFile;
    } else {
        nextFiles.push(normalizedFile);
    }

    return nextFiles.sort((first, second) => {
        if (first.path === IUIN_README_MAIN_FILE) {
            return -1;
        }

        if (second.path === IUIN_README_MAIN_FILE) {
            return 1;
        }

        return first.path.localeCompare(second.path);
    });
}

function sanitizeReadmePath(path: string): string {
    return path.
        replace(/\\/g, '/').
        split('/').
        map((segment) => segment.trim()).
        filter((segment) => segment && segment !== '.' && segment !== '..').
        join('/');
}

function getReadmeFileType(path: string, content: string): IuinReadmeFile['type'] {
    if ((/^data:image\//).test(content) || (/\.(gif|png|jpe?g|webp|svg)$/i).test(path)) {
        return 'asset';
    }

    if ((/\.(md|markdown)$/i).test(path)) {
        return 'markdown';
    }

    return 'text';
}

function getStringProp(props: Record<string, string>, key: string, defaultValue: string): string {
    return Object.prototype.hasOwnProperty.call(props, key) ? props[key] : defaultValue;
}

function normalizeLegacyReadmeMarkdown(content: string): string {
    const trimmed = content.trim();
    const looksLikeLegacySummaryHtml = /<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/i.test(trimmed) &&
        (/<p[^>]*class=(["'])[^"']*iuin-profile-lead[^"']*\1[^>]*>[\s\S]*?<\/p>/i.test(trimmed) || /^<h[1-6][^>]*>[\s\S]*<\/p>\s*$/i.test(trimmed));

    if (!looksLikeLegacySummaryHtml) {
        return content;
    }

    const markdown = trimmed.
        replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_match, text) => `# ${htmlToMarkdownText(text)}\n\n`).
        replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_match, text) => `## ${htmlToMarkdownText(text)}\n\n`).
        replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_match, text) => `### ${htmlToMarkdownText(text)}\n\n`).
        replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_match, text) => `#### ${htmlToMarkdownText(text)}\n\n`).
        replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_match, text) => `##### ${htmlToMarkdownText(text)}\n\n`).
        replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_match, text) => `###### ${htmlToMarkdownText(text)}\n\n`).
        replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_match, text) => `${htmlToMarkdownText(text)}\n\n`).
        replace(/<br\s*\/?>/gi, '\n').
        replace(/<[^>]+>/g, '').
        split('\n').
        map((line) => line.trimEnd()).
        join('\n').
        replace(/\n{3,}/g, '\n\n').
        trim();

    return markdown || content;
}

function htmlToMarkdownText(value: string): string {
    return decodeHtmlEntities(value.
        replace(/<br\s*\/?>/gi, '\n').
        replace(/<a[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_match, _quote, href, text) => `[${htmlToMarkdownText(text)}](${href})`).
        replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_match, text) => `**${htmlToMarkdownText(text)}**`).
        replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, (_match, text) => `**${htmlToMarkdownText(text)}**`).
        replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_match, text) => `*${htmlToMarkdownText(text)}*`).
        replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, (_match, text) => `*${htmlToMarkdownText(text)}*`).
        replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_match, text) => `\`${htmlToMarkdownText(text)}\``).
        replace(/<[^>]+>/g, '')).
        replace(/[ \t]+\n/g, '\n').
        replace(/[ \t]{2,}/g, ' ').
        trim();
}

function decodeHtmlEntities(value: string): string {
    if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = value;
        return textarea.value;
    }

    return value.
        replace(/&nbsp;/g, ' ').
        replace(/&amp;/g, '&').
        replace(/&lt;/g, '<').
        replace(/&gt;/g, '>').
        replace(/&quot;/g, '"').
        replace(/&#039;/g, "'");
}

export function sanitizeIuinProfileHtml(rawHtml: string): string {
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
        return '';
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    const output = document.createElement('div');

    Array.from(doc.body.childNodes).forEach((node) => {
        const sanitized = sanitizeNode(node);
        if (sanitized) {
            output.appendChild(sanitized);
        }
    });

    return output.innerHTML;
}

function sanitizeNode(node: ChildNode): Node | null {
    if (node.nodeType === Node.TEXT_NODE) {
        return document.createTextNode(node.textContent || '');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return null;
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();

    if (!allowedTags.has(tagName)) {
        const fragment = document.createDocumentFragment();
        Array.from(element.childNodes).forEach((child) => {
            const sanitizedChild = sanitizeNode(child);
            if (sanitizedChild) {
                fragment.appendChild(sanitizedChild);
            }
        });

        return fragment;
    }

    const sanitizedElement = document.createElement(tagName);

    Array.from(element.attributes).forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim();

        if (!allowedAttributes.has(name) || name.startsWith('on')) {
            return;
        }

        if ((name === 'href' || name === 'src') && !isSafeUrl(value, name === 'src')) {
            return;
        }

        if (name === 'srcset' && !isSafeSrcSet(value)) {
            return;
        }

        if (name === 'style' && !isSafeStyle(value)) {
            return;
        }

        sanitizedElement.setAttribute(name, value);
    });

    if (tagName === 'a') {
        sanitizedElement.setAttribute('rel', 'noopener noreferrer');
        if (!sanitizedElement.getAttribute('target')) {
            sanitizedElement.setAttribute('target', '_blank');
        }
    }

    Array.from(element.childNodes).forEach((child) => {
        const sanitizedChild = sanitizeNode(child);
        if (sanitizedChild) {
            sanitizedElement.appendChild(sanitizedChild);
        }
    });

    return sanitizedElement;
}

function isSafeUrl(value: string, allowImageData: boolean): boolean {
    const normalized = value.trim().toLowerCase();

    if (!normalized) {
        return false;
    }

    if (normalized.startsWith('/') || normalized.startsWith('#')) {
        return true;
    }

    if (normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('mailto:')) {
        return true;
    }

    return allowImageData && (/^data:image\/(gif|png|jpe?g|webp|svg\+xml);base64,/).test(normalized);
}

function isSafeSrcSet(value: string): boolean {
    return value.split(',').every((candidate) => {
        const [url] = candidate.trim().split(/\s+/);

        return Boolean(url) && isSafeUrl(url, true);
    });
}

function isSafeStyle(value: string): boolean {
    return !(/(javascript:|expression\s*\(|@import|behavior\s*:|url\s*\()/i).test(value);
}

function escapeHtml(value: string): string {
    return value.
        replace(/&/g, '&amp;').
        replace(/</g, '&lt;').
        replace(/>/g, '&gt;').
        replace(/"/g, '&quot;').
        replace(/'/g, '&#039;');
}
