import React from "react";
import {
  Instagram,
  Youtube,
  Music2,
  Mail,
  Heart,
  Globe,
  Twitch,
  Facebook,
  Linkedin,
} from "lucide-react";
import { resolvePlatform } from "./social-platforms.js";
import { brandPaths } from "./brand-paths";
const lineIcons = {
  instagram: Instagram,
  youtube: Youtube,
  tiktok: Music2,
  mail: Mail,
  heart: Heart,
  globe: Globe,
  twitch: Twitch,
  facebook: Facebook,
  linkedin: Linkedin,
};
export function SocialIcon({
  name,
  url,
  size = 21,
  strokeWidth = 1.65,
  ...props
}) {
  name = resolvePlatform(name, url);
  const path = brandPaths[name === "twitter" ? "x" : name];
  if (path)
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        <path d={path} />
      </svg>
    );
  const Icon = lineIcons[name] || Globe;
  return <Icon size={size} strokeWidth={strokeWidth} {...props} />;
}
