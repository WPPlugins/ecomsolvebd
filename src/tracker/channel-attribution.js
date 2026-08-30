/**
 * Default marketing channel groups (GA4-style). Mirrors server `channel-attribution.ts`.
 */

export const MARKETING_CHANNELS = [
  "Organic Search",
  "Organic Social",
  "Messaging",
  "Paid Search",
  "Paid Social",
  "Referral",
  "Email",
  "SMS",
  "Push Notification",
  "Affiliate",
  "Direct",
  "Unknown",
];

const SEARCH_ENGINES = [
  {
    id: "Google",
    hosts: ["google.", "googleusercontent."],
    aliases: ["google", "googleads", "adwords"],
    referrerPatterns: ["android-app://com.google.android.googlequicksearchbox", "com.google.android.googlequicksearchbox"],
    userAgentPatterns: ["gsa/", "googlequicksearchbox"],
  },
  { id: "Bing", hosts: ["bing.", "msn."], aliases: ["bing", "microsoft"] },
  { id: "Yahoo", hosts: ["yahoo.", "search.yahoo."], aliases: ["yahoo"] },
  { id: "DuckDuckGo", hosts: ["duckduckgo.", "ddg."], aliases: ["duckduckgo", "ddg"] },
  { id: "Ecosia", hosts: ["ecosia."], aliases: ["ecosia"] },
  { id: "Baidu", hosts: ["baidu."], aliases: ["baidu"] },
  { id: "Yandex", hosts: ["yandex."], aliases: ["yandex"] },
];

const SOCIAL_NETWORKS = [
  {
    id: "Facebook",
    hosts: ["facebook.", "fb.", "m.facebook.", "l.facebook.", "lm.facebook."],
    aliases: ["facebook", "fb", "meta"],
    referrerPatterns: ["android-app://com.facebook.katana", "com.facebook.katana", "fb://"],
    userAgentPatterns: ["[fban/fbios", "[fb_iab/fb4a", "[fban/fb4a", " fbav/"],
  },
  {
    id: "Instagram",
    hosts: ["instagram.", "l.instagram."],
    aliases: ["instagram", "ig"],
    referrerPatterns: ["android-app://com.instagram.android", "com.instagram.android"],
    userAgentPatterns: ["instagram"],
  },
  {
    id: "TikTok",
    hosts: ["tiktok."],
    aliases: ["tiktok", "tt"],
    referrerPatterns: ["android-app://com.zhiliaoapp.musically", "com.zhiliaoapp.musically"],
    userAgentPatterns: ["musical_ly", "bytedancewebview", "aweme", "ttwebview", "tiktok"],
  },
  { id: "X", hosts: ["twitter.", "t.co", "x.com"], aliases: ["twitter", "x"] },
  { id: "LinkedIn", hosts: ["linkedin.", "lnkd.in"], aliases: ["linkedin"], userAgentPatterns: ["linkedinapp"] },
  { id: "Pinterest", hosts: ["pinterest.", "pin.it"], aliases: ["pinterest"] },
  { id: "Reddit", hosts: ["reddit."], aliases: ["reddit"] },
  { id: "Snapchat", hosts: ["snapchat."], aliases: ["snapchat"] },
  { id: "YouTube", hosts: ["youtube.", "youtu.be"], aliases: ["youtube", "yt"] },
];

const EMAIL_PROVIDERS = [
  {
    id: "Gmail",
    hosts: ["mail.google.com"],
    aliases: ["gmail", "googlemail"],
    referrerPatterns: ["android-app://com.google.android.gm", "com.google.android.gm"],
    userAgentPatterns: ["gmail/"],
  },
  {
    id: "Outlook",
    hosts: ["outlook.live.com", "outlook.office.com"],
    aliases: ["outlook", "hotmail", "live"],
    referrerPatterns: ["android-app://com.microsoft.office.outlook", "com.microsoft.office.outlook"],
    userAgentPatterns: ["outlook-ios/"],
  },
  {
    id: "Yahoo Mail",
    hosts: ["mail.yahoo.com"],
    aliases: ["yahoo_mail", "yahoomail"],
    referrerPatterns: ["android-app://com.yahoo.mobile.client.android.mail", "com.yahoo.mobile.client.android.mail"],
  },
  {
    id: "ProtonMail",
    hosts: ["mail.proton.me", "protonmail.com", "proton.me"],
    aliases: ["protonmail", "proton_mail", "proton"],
    referrerPatterns: ["android-app://me.proton.android.mail", "me.proton.android.mail"],
  },
  {
    id: "Apple Mail",
    hosts: ["icloud.com", "me.com", "mac.com"],
    aliases: ["apple_mail", "applemail", "icloud_mail", "icloud"],
    referrerPatterns: ["x-mail://", "message://", "mobilemail"],
  },
];

const MESSAGING_NETWORKS = [
  {
    id: "WhatsApp",
    hosts: ["whatsapp.", "wa.me", "api.whatsapp.com"],
    aliases: ["whatsapp"],
    referrerPatterns: ["android-app://com.whatsapp", "com.whatsapp"],
    userAgentPatterns: ["whatsapp"],
  },
  {
    id: "Messenger",
    hosts: ["messenger.", "l.messenger."],
    aliases: ["messenger", "orca", "facebook_orca"],
    referrerPatterns: ["android-app://com.facebook.orca", "com.facebook.orca"],
    userAgentPatterns: ["messengerforios", "fb_iab/messenger"],
  },
  {
    id: "Telegram",
    hosts: ["telegram.", "t.me"],
    aliases: ["telegram"],
    referrerPatterns: ["android-app://org.telegram.messenger", "org.telegram.messenger"],
  },
];

const AFFILIATE_CLICK_KEYS = new Set([
  "irclickid",
  "cjevent",
  "sscid",
  "affclid",
  "affiliate_id",
  "ranSiteID",
  "clickref",
]);

const PAID_MEDIUM = new Set([
  "cpc",
  "ppc",
  "paid",
  "paidsearch",
  "paid_search",
  "paid-social",
  "paid_social",
  "paidsocial",
  "cpm",
  "cpv",
  "display",
  "retargeting",
]);

const ORGANIC_MEDIUM = new Set(["organic", "seo", "natural"]);
const SOCIAL_MEDIUM = new Set(["social", "social-network", "social_network", "organic-social", "organic_social"]);
const EMAIL_MEDIUM = new Set(["email", "e-mail", "e_mail", "newsletter", "mail"]);
const MESSAGING_MEDIUM = new Set(["messaging", "message", "chat", "dm", "whatsapp", "messenger", "telegram", "line", "viber", "imo"]);
const SMS_MEDIUM = new Set(["sms", "text", "text-message", "text_message"]);
const PUSH_MEDIUM = new Set(["push", "notification", "mobile-push", "mobile_push", "app-push", "app_push"]);
const AFFILIATE_MEDIUM = new Set(["affiliate", "affiliates", "partner", "partnership", "aff"]);
const REFERRAL_MEDIUM = new Set(["referral", "link", "app", "web"]);
const DIRECT_SOURCE = new Set(["(direct)", "direct", "(none)", "none", "not set", "(not set)"]);
const INTERNAL_STORE_SOURCE = new Set([
  "shop",
  "store",
  "woocommerce",
  "woo",
  "wc",
  "checkout",
  "internal",
  "pos",
  "admin",
]);

function safeString(v) {
  return typeof v === "string" ? v.trim() : "";
}

function normToken(v) {
  return safeString(v).toLowerCase().replace(/[\s-]+/g, "_");
}

function recordOrEmpty(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function mergeUtm(payload) {
  const p = recordOrEmpty(payload);
  const out = {};
  const buckets = [recordOrEmpty(p.utm), recordOrEmpty(p.normalized_attribution), recordOrEmpty(recordOrEmpty(p.first_touch).utm)];
  for (const b of buckets) {
    for (const [k, v] of Object.entries(b)) {
      const val = safeString(v);
      if (val) out[k.toLowerCase()] = val;
    }
  }
  return out;
}

function mergeClickIds(payload) {
  const p = recordOrEmpty(payload);
  const out = {};
  const buckets = [
    recordOrEmpty(p.click_ids),
    recordOrEmpty(p.normalized_click_ids),
    recordOrEmpty(recordOrEmpty(p.first_touch).clickIds),
    recordOrEmpty(recordOrEmpty(p.first_touch).click_ids),
  ];
  for (const b of buckets) {
    for (const [k, v] of Object.entries(b)) {
      const val = safeString(v);
      if (val) out[k.toLowerCase()] = val;
    }
  }
  return out;
}

function pickUtm(utm, ...keys) {
  for (const k of keys) {
    const v = utm[k] ?? utm[k.toLowerCase()];
    if (v) return v;
  }
  return "";
}

function referrerHost(payload) {
  const ref = safeString(recordOrEmpty(payload).referrer);
  if (!ref) {
    const ft = recordOrEmpty(recordOrEmpty(payload).first_touch);
    const ftRef = safeString(ft.referrer);
    if (!ftRef) return "";
    try {
      return new URL(ftRef).hostname.toLowerCase();
    } catch {
      return "";
    }
  }
  try {
    return new URL(ref).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function referrerRaw(payload) {
  const ref = safeString(recordOrEmpty(payload).referrer);
  if (ref) return ref.toLowerCase();
  const ft = recordOrEmpty(recordOrEmpty(payload).first_touch);
  return safeString(ft.referrer).toLowerCase();
}

function pageUrlHost(payload) {
  const p = recordOrEmpty(payload);
  const ft = recordOrEmpty(p.first_touch);
  const url = safeString(p.url || p.page_location || p.pageLocation || ft.landingUrl || ft.url);
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function currentUserAgent(payload) {
  const p = recordOrEmpty(payload);
  return safeString(p.client_user_agent || p.user_agent).toLowerCase();
}

function currentSessionId(payload) {
  const p = recordOrEmpty(payload);
  return safeString(p.session_id || p.sass_session_id);
}

function readSessionTouch(payload) {
  const p = recordOrEmpty(payload);
  const touch = recordOrEmpty(p.session_touch);
  if (!Object.keys(touch).length) return null;
  const currentSession = currentSessionId(payload);
  const touchSession = safeString(touch.sessionId || touch.session_id || touch.sass_session_id);
  if (currentSession && touchSession && currentSession !== touchSession) return null;
  return touch;
}

function normalizeHost(host) {
  return host.replace(/^www\./, "").toLowerCase();
}

function isSameSiteHost(pageHost, refHost) {
  const page = normalizeHost(pageHost);
  const ref = normalizeHost(refHost);
  if (!page || !ref) return false;
  if (page === ref) return true;
  return page.endsWith(`.${ref}`) || ref.endsWith(`.${page}`);
}

function isInternalStoreSource(srcNorm) {
  if (!srcNorm) return false;
  if (INTERNAL_STORE_SOURCE.has(srcNorm)) return true;
  return srcNorm.endsWith("_shop") || srcNorm.endsWith("_store");
}

function isDirectLikeVisit(input) {
  if (input.hasPaidSearch || input.hasPaidSocial || input.hasAffiliate) return false;
  if (input.medBucket === "email" || input.medBucket === "sms" || input.medBucket === "push") return false;
  if (input.medBucket === "paid" || input.medBucket === "affiliate") return false;
  if (DIRECT_SOURCE.has(input.srcNorm)) return true;
  if (isInternalStoreSource(input.srcNorm)) return true;
  if (input.host && input.pageHost && isSameSiteHost(input.pageHost, input.host)) return true;
  return false;
}

function hostMatches(host, patterns) {
  return patterns.some((p) => host.includes(p));
}

function referrerPatternMatches(rawReferrer, patterns) {
  if (!rawReferrer || !patterns || !patterns.length) return false;
  return patterns.some((pattern) => rawReferrer.includes(pattern));
}

function userAgentPatternMatches(userAgent, patterns) {
  if (!userAgent || !patterns || !patterns.length) return false;
  return patterns.some((pattern) => userAgent.includes(pattern));
}

function sourceMatchesNetwork(source, network) {
  const s = normToken(source);
  if (!s) return false;
  return network.aliases.some((a) => s === a || s.includes(a));
}

function detectSearchEngine(source, host, rawReferrer, userAgent) {
  for (const se of SEARCH_ENGINES) {
    if (
      hostMatches(host, se.hosts) ||
      sourceMatchesNetwork(source, se) ||
      referrerPatternMatches(rawReferrer, se.referrerPatterns) ||
      userAgentPatternMatches(userAgent, se.userAgentPatterns)
    ) {
      return se;
    }
  }
  return null;
}

function detectSocialNetwork(source, host, rawReferrer, userAgent) {
  for (const sn of SOCIAL_NETWORKS) {
    if (
      hostMatches(host, sn.hosts) ||
      sourceMatchesNetwork(source, sn) ||
      referrerPatternMatches(rawReferrer, sn.referrerPatterns) ||
      userAgentPatternMatches(userAgent, sn.userAgentPatterns)
    ) {
      return sn;
    }
  }
  return null;
}

function detectEmailProvider(source, host, rawReferrer, userAgent) {
  for (const provider of EMAIL_PROVIDERS) {
    if (
      hostMatches(host, provider.hosts) ||
      sourceMatchesNetwork(source, provider) ||
      referrerPatternMatches(rawReferrer, provider.referrerPatterns) ||
      userAgentPatternMatches(userAgent, provider.userAgentPatterns)
    ) {
      return provider;
    }
  }
  return null;
}

function detectMessagingNetwork(source, host, rawReferrer, userAgent) {
  for (const network of MESSAGING_NETWORKS) {
    if (
      hostMatches(host, network.hosts) ||
      sourceMatchesNetwork(source, network) ||
      referrerPatternMatches(rawReferrer, network.referrerPatterns) ||
      userAgentPatternMatches(userAgent, network.userAgentPatterns)
    ) {
      return network;
    }
  }
  return null;
}

function hasAffiliateClickId(ids) {
  return Object.keys(ids).some((k) => AFFILIATE_CLICK_KEYS.has(k.toLowerCase()));
}

function isPaidSearchClick(ids) {
  return Boolean(ids.gclid || ids.gbraid || ids.wbraid || ids.msclkid || ids.dclid);
}

const EXPLICIT_PAID_ATTRIBUTION_KEYS = new Set([
  "utm_id",
  "utm_content",
  "utm_term",
  "campaign_id",
  "campaignid",
  "campaign_name",
  "ad_id",
  "adid",
  "ad_name",
  "adset_id",
  "adsetid",
  "adset_name",
  "adgroup_id",
  "adgroupid",
  "adgroup_name",
  "creative_id",
  "creativeid",
  "creative_name",
  "placement",
  "site_source_name",
]);

function hasSignalValue(value) {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => typeof item === "string" && item.trim().length > 0);
  return false;
}

function hasExplicitPaidAttribution(payload) {
  const p = recordOrEmpty(payload);
  const ft = recordOrEmpty(p.first_touch);
  const buckets = [
    recordOrEmpty(p.utm),
    recordOrEmpty(p.normalized_attribution),
    recordOrEmpty(p.raw_query_params),
    recordOrEmpty(ft.utm),
    recordOrEmpty(ft.normalized_attribution),
    recordOrEmpty(ft.raw_query_params),
  ];
  return buckets.some((bucket) =>
    Object.entries(bucket).some(([key, value]) => EXPLICIT_PAID_ATTRIBUTION_KEYS.has(key.toLowerCase()) && hasSignalValue(value)),
  );
}

function mediumBucket(medium) {
  const m = normToken(medium);
  if (EMAIL_MEDIUM.has(m)) return "email";
  if (MESSAGING_MEDIUM.has(m)) return "messaging";
  if (SMS_MEDIUM.has(m)) return "sms";
  if (PUSH_MEDIUM.has(m)) return "push";
  if (AFFILIATE_MEDIUM.has(m)) return "affiliate";
  if (PAID_MEDIUM.has(m)) return "paid";
  if (ORGANIC_MEDIUM.has(m)) return "organic";
  if (SOCIAL_MEDIUM.has(m)) return "social";
  if (REFERRAL_MEDIUM.has(m)) return "referral";
  return m;
}

function inferPlatformFromClickIds(ids) {
  if (ids.fbclid) return "Facebook";
  if (ids.gclid || ids.gbraid || ids.wbraid) return "Google";
  if (ids.ttclid) return "TikTok";
  if (ids.msclkid) return "Bing";
  if (ids.li_fat_id) return "LinkedIn";
  if (ids.epik) return "Pinterest";
  if (ids.twclid) return "X";
  if (ids.rdt_cid) return "Reddit";
  if (ids.scclid) return "Snapchat";
  return null;
}

function formatDetailLabel(raw) {
  const known = [...SEARCH_ENGINES, ...SOCIAL_NETWORKS].find((n) => n.id.toLowerCase() === raw.toLowerCase());
  if (known) return known.id;
  return raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * @param {Record<string, unknown>} payload
 */
export function classifyMarketingChannel(payload) {
  const utm = mergeUtm(payload);
  const ids = mergeClickIds(payload);
  const host = referrerHost(payload);
  const rawReferrer = referrerRaw(payload);
  const pageHost = pageUrlHost(payload);
  const userAgent = currentUserAgent(payload);
  const sessionTouch = readSessionTouch(payload);

  let source = pickUtm(utm, "utm_source", "source");
  let medium = pickUtm(utm, "utm_medium", "medium");
  if (!source) {
    const fromClick = inferPlatformFromClickIds(ids);
    if (fromClick) source = fromClick.toLowerCase();
  }
  if (!source && !medium && !host && Object.keys(ids).length === 0 && sessionTouch) {
    const touchSource = safeString(sessionTouch.source);
    const touchMedium = safeString(sessionTouch.medium);
    if (touchSource) source = touchSource;
    if (touchMedium) medium = touchMedium;
  }
  const emailProvider = detectEmailProvider(source, host, rawReferrer, userAgent);
  if (!source && emailProvider) source = emailProvider.aliases[0] || emailProvider.id.toLowerCase();
  if (!medium && emailProvider) medium = "email";
  const messagingNetwork = detectMessagingNetwork(source, host, rawReferrer, userAgent);
  if (!source && messagingNetwork) source = messagingNetwork.aliases[0] || messagingNetwork.id.toLowerCase();
  if (!medium && messagingNetwork) medium = "messaging";
  const srcNorm = normToken(source);
  const medBucket = mediumBucket(medium);

  const searchEngine = detectSearchEngine(source, host, rawReferrer, userAgent);
  const socialNetwork = detectSocialNetwork(source, host, rawReferrer, userAgent);
  const hasPaidSearch = isPaidSearchClick(ids);
  const hasPaidSocial = Boolean(socialNetwork) && (medBucket === "paid" || hasExplicitPaidAttribution(payload));
  const hasAffiliate = hasAffiliateClickId(ids) || medBucket === "affiliate";
  const hasAnySignal =
    Boolean(source || medium || host || Object.keys(ids).length > 0) &&
    !(DIRECT_SOURCE.has(srcNorm) && !medium && !host && Object.keys(ids).length === 0);

  if (medBucket === "email" || srcNorm === "email" || emailProvider || host.includes("mail.")) {
    return { channel: "Email", channelDetail: emailProvider ? emailProvider.id : source ? formatDetailLabel(source) : null, platformSource: source || (emailProvider ? emailProvider.aliases[0] : null), platformMedium: medium || "email" };
  }
  if (medBucket === "messaging" || messagingNetwork) {
    return { channel: "Messaging", channelDetail: messagingNetwork ? messagingNetwork.id : source ? formatDetailLabel(source) : null, platformSource: source || (messagingNetwork ? messagingNetwork.aliases[0] : null), platformMedium: medium || "messaging" };
  }
  if (medBucket === "sms") {
    return { channel: "SMS", channelDetail: source ? formatDetailLabel(source) : null, platformSource: source || null, platformMedium: medium || "sms" };
  }
  if (medBucket === "push") {
    return { channel: "Push Notification", channelDetail: source ? formatDetailLabel(source) : null, platformSource: source || null, platformMedium: medium || "push" };
  }
  if (hasAffiliate) {
    return { channel: "Affiliate", channelDetail: source ? formatDetailLabel(source) : null, platformSource: source || null, platformMedium: medium || "affiliate" };
  }
  if (hasPaidSearch || (medBucket === "paid" && searchEngine)) {
    return {
      channel: "Paid Search",
      channelDetail: searchEngine?.id ?? inferPlatformFromClickIds(ids) ?? (source ? formatDetailLabel(source) : null),
      platformSource: source || searchEngine?.aliases[0] || null,
      platformMedium: medium || "cpc",
    };
  }
  if (hasPaidSocial || (medBucket === "paid" && socialNetwork)) {
    return {
      channel: "Paid Social",
      channelDetail: socialNetwork?.id ?? inferPlatformFromClickIds(ids) ?? (source ? formatDetailLabel(source) : null),
      platformSource: source || socialNetwork?.aliases[0] || null,
      platformMedium: medium || "paid_social",
    };
  }
  if (medBucket === "paid") {
    return {
      channel: socialNetwork ? "Paid Social" : searchEngine ? "Paid Search" : "Referral",
      channelDetail: socialNetwork?.id ?? searchEngine?.id ?? (source ? formatDetailLabel(source) : inferPlatformFromClickIds(ids)),
      platformSource: source || null,
      platformMedium: medium || "paid",
    };
  }
  if (medBucket === "organic" && searchEngine) {
    return { channel: "Organic Search", channelDetail: searchEngine.id, platformSource: source || searchEngine.aliases[0], platformMedium: medium || "organic" };
  }
  if ((medBucket === "organic" || medBucket === "social") && socialNetwork) {
    return { channel: "Organic Social", channelDetail: socialNetwork.id, platformSource: source || socialNetwork.aliases[0], platformMedium: medium || "social" };
  }
  if (searchEngine && !hasPaidSearch) {
    return { channel: "Organic Search", channelDetail: searchEngine.id, platformSource: source || searchEngine.aliases[0], platformMedium: medium || "organic" };
  }
  if (socialNetwork && !hasPaidSocial) {
    return { channel: "Organic Social", channelDetail: socialNetwork.id, platformSource: source || socialNetwork.aliases[0], platformMedium: medium || "social" };
  }
  if (!hasAnySignal || DIRECT_SOURCE.has(srcNorm)) {
    return { channel: "Direct", channelDetail: null, platformSource: source || null, platformMedium: medium || "direct" };
  }
  if (medBucket === "referral" || (host && !searchEngine && !socialNetwork)) {
    const detail =
      source && !DIRECT_SOURCE.has(srcNorm) && !isInternalStoreSource(srcNorm)
        ? formatDetailLabel(source)
        : host
          ? host.replace(/^www\./, "").split(".")[0]
          : null;
    return { channel: "Referral", channelDetail: detail, platformSource: source || null, platformMedium: medium || "referral" };
  }
  if (source || medium) {
    return { channel: "Unknown", channelDetail: source ? formatDetailLabel(source) : null, platformSource: source || null, platformMedium: medium || null };
  }
  return { channel: "Unknown", channelDetail: null, platformSource: null, platformMedium: null };
}

/**
 * @param {Record<string, unknown>} record
 */
export function enrichPayloadWithMarketingChannel(record) {
  const attr = classifyMarketingChannel(record);
  record.marketing_channel = attr.channel;
  if (attr.channelDetail) record.marketing_channel_detail = attr.channelDetail;
  if (attr.platformSource) record.platform_source = attr.platformSource;
  if (attr.platformMedium) record.platform_medium = attr.platformMedium;
}
