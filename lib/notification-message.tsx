import React from "react";
import { Text, Linking, type TextStyle, type StyleProp } from "react-native";

const URL_RE =
  /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (/^www\./i.test(t)) return `https://${t}`;
  return t;
}

/**
 * Renders notification body with tappable http(s) and www. links.
 */
export function NotificationMessageText({
  message,
  baseStyle,
  linkColor,
}: {
  message: string;
  baseStyle: StyleProp<TextStyle>;
  linkColor: string;
}): React.ReactElement {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  const text = message || "";
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text)) !== null) {
    const start = m.index;
    const match = m[0];
    if (start > lastIndex) {
      parts.push(
        <Text key={`t${key++}`} style={baseStyle}>
          {text.slice(lastIndex, start)}
        </Text>
      );
    }
    const href = normalizeUrl(match);
    parts.push(
      <Text
        key={`l${key++}`}
        style={[baseStyle, { color: linkColor, textDecorationLine: "underline" }]}
        onPress={() => {
          void Linking.openURL(href);
        }}
      >
        {match}
      </Text>
    );
    lastIndex = start + match.length;
  }
  if (lastIndex < text.length) {
    parts.push(
      <Text key={`t${key++}`} style={baseStyle}>
        {text.slice(lastIndex)}
      </Text>
    );
  }
  if (parts.length === 0) {
    return <Text style={baseStyle}>{text}</Text>;
  }
  return <Text style={baseStyle}>{parts}</Text>;
}
