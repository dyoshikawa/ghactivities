// GitHub logins are at most 39 characters of alphanumerics or hyphens, and a
// hyphen cannot start, end, or repeat. The lookahead makes each repetition
// consume exactly one character, so hyphens count toward the 39-character cap.
export const GITHUB_LOGIN_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
