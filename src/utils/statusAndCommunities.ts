import type {
  Community,
  Conversation,
  StatusAudience,
  StatusTheme,
  StatusUpdate,
} from '../types/handrawina';

export const STATUS_THEMES: {
  id: StatusTheme;
  label: string;
  surfaceClass: string;
  accentClass: string;
  textClass: string;
  mutedTextClass: string;
  isLight: boolean;
}[] = [
  {
    id: 'navy',
    label: 'Biru Dongker',
    surfaceClass: 'bg-gradient-to-br from-[#0B1D3A] via-[#102A54] to-[#071329]',
    accentClass: 'text-sky-300',
    textClass: 'text-stone-50',
    mutedTextClass: 'text-slate-300/90',
    isLight: false,
  },
  {
    id: 'champagne',
    label: 'Emas Sampanye',
    surfaceClass: 'bg-gradient-to-br from-[#3A2B14] via-[#281E0F] to-[#161109]',
    accentClass: 'text-amber-300',
    textClass: 'text-stone-50',
    mutedTextClass: 'text-amber-100/80',
    isLight: false,
  },
  {
    id: 'orange-light',
    label: 'Orange Light',
    surfaceClass: 'bg-gradient-to-br from-[#FFEDD5] via-[#FDBA74] to-[#FB923C]',
    accentClass: 'text-orange-950',
    textClass: 'text-stone-950',
    mutedTextClass: 'text-stone-900/80',
    isLight: true,
  },
  {
    id: 'bronze',
    label: 'Perunggu Senja',
    surfaceClass: 'bg-gradient-to-br from-[#3B2318] via-[#291812] to-[#140C0A]',
    accentClass: 'text-orange-200',
    textClass: 'text-stone-50',
    mutedTextClass: 'text-stone-300/90',
    isLight: false,
  },
];

export const VALID_STATUS_THEMES = new Set<StatusTheme>([
  'navy',
  'champagne',
  'orange-light',
  'bronze',
]);
export const VALID_STATUS_AUDIENCES = new Set<StatusAudience>([
  'all-contacts',
  'close-circle',
  'selected-groups',
]);
export const VALID_COMMUNITY_CATEGORIES = new Set<string>([
  'Teknologi & Keamanan',
  'Produk & Desain',
  'Eksekutif & Bisnis',
  'Komunitas Umum',
]);

export function validateStatusDraft(params: {
  text: string;
  theme?: string;
  audience?: string;
  captionTag?: string;
}): {
  valid: boolean;
  error?: string;
  cleanText: string;
  theme: StatusTheme;
  audience: StatusAudience;
  captionTag?: string;
} {
  const cleanText = params.text.trim();
  const normalizedTheme =
    params.theme === 'obsidian'
      ? 'navy'
      : params.theme === 'emerald'
      ? 'orange-light'
      : params.theme;
  const theme: StatusTheme = VALID_STATUS_THEMES.has(normalizedTheme as StatusTheme)
    ? (normalizedTheme as StatusTheme)
    : 'champagne';
  const audience: StatusAudience = VALID_STATUS_AUDIENCES.has(params.audience as StatusAudience)
    ? (params.audience as StatusAudience)
    : 'all-contacts';
  const cleanTag = params.captionTag?.trim().slice(0, 40) || undefined;

  if (cleanText.length === 0) {
    return {
      valid: false,
      error: 'Tulis pembaruan status terlebih dahulu sebelum dibagikan.',
      cleanText: '',
      theme,
      audience,
    };
  }
  if (cleanText.length > 420) {
    return {
      valid: false,
      error: 'Pembaruan status maksimal 420 karakter.',
      cleanText: cleanText.slice(0, 420),
      theme,
      audience,
    };
  }

  return {
    valid: true,
    cleanText,
    theme,
    audience,
    captionTag: cleanTag,
  };
}

export function groupStatusesByViewed(
  statuses: StatusUpdate[],
  currentUserId = 'self'
): {
  mine: StatusUpdate[];
  unviewedContacts: StatusUpdate[];
  viewedContacts: StatusUpdate[];
} {
  const mine: StatusUpdate[] = [];
  const unviewedContacts: StatusUpdate[] = [];
  const viewedContacts: StatusUpdate[] = [];

  for (const item of statuses) {
    if (item.authorId === currentUserId) {
      mine.push(item);
    } else if (item.viewedByMe) {
      viewedContacts.push(item);
    } else {
      unviewedContacts.push(item);
    }
  }

  return { mine, unviewedContacts, viewedContacts };
}

export function validateCommunityInput(params: {
  name: string;
  description: string;
  category?: string;
}): {
  valid: boolean;
  error?: string;
  cleanName: string;
  cleanDescription: string;
  category: string;
} {
  const cleanName = params.name.trim();
  const cleanDescription = params.description.trim();
  const category =
    params.category && VALID_COMMUNITY_CATEGORIES.has(params.category)
      ? params.category
      : 'Komunitas Umum';

  if (cleanName.length < 3) {
    return {
      valid: false,
      error: 'Nama komunitas minimal 3 karakter.',
      cleanName,
      cleanDescription,
      category,
    };
  }
  if (cleanDescription.length < 6) {
    return {
      valid: false,
      error: 'Deskripsi singkat komunitas minimal 6 karakter.',
      cleanName,
      cleanDescription,
      category,
    };
  }

  return {
    valid: true,
    cleanName: cleanName.slice(0, 72),
    cleanDescription: cleanDescription.slice(0, 220),
    category,
  };
}

export function filterCommunities(
  communities: Community[],
  query: string
): Community[] {
  const q = query.trim().toLowerCase();
  if (!q) return communities;
  return communities.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.subGroups.some((g) => g.name.toLowerCase().includes(q))
  );
}

export function computeCommunityStats(
  community: Community,
  conversations: Conversation[]
): {
  totalSubGroups: number;
  joinedSubGroups: number;
  totalMembers: number;
} {
  const convById = new Map(conversations.map((c) => [c.id, c]));
  let joinedSubGroups = 0;
  let memberSum = 0;

  for (const sg of community.subGroups) {
    if (sg.joined) joinedSubGroups += 1;
    const liveConv = sg.conversationId ? convById.get(sg.conversationId) : undefined;
    memberSum += liveConv ? liveConv.participantCount : sg.participantCount;
  }

  return {
    totalSubGroups: community.subGroups.length,
    joinedSubGroups,
    totalMembers: Math.max(community.memberCount, memberSum),
  };
}
