import { useSyncExternalStore } from 'react';
import { appIcon, isImageIcon, subscribeIcons, iconsVersion } from '../services/iconRegistry';

/**
 * Renders an app icon by registry key.
 *
 * Resolves to the admin's override when one exists, otherwise the shipped
 * default. Subscribing to the registry means changing an icon updates every
 * place it appears immediately, with no page reload.
 *
 * The icon is always decorative: it is marked aria-hidden and the surrounding
 * control carries the accessible name. Status is never communicated by icon
 * alone.
 */
export function AppIcon({ name, className = '' }: { name: string; className?: string }) {
  // Re-render whenever any override changes.
  useSyncExternalStore(subscribeIcons, iconsVersion, iconsVersion);
  const value = appIcon(name);

  if (isImageIcon(value)) {
    return (
      <img
        src={value}
        alt=""
        aria-hidden="true"
        className={`inline-block h-[1em] w-[1em] shrink-0 object-contain align-[-0.125em] ${className}`}
      />
    );
  }
  return (
    <span aria-hidden="true" className={className}>
      {value}
    </span>
  );
}

/** Hook form, for the few places that need the raw value (e.g. document title). */
export function useAppIcon(name: string): string {
  useSyncExternalStore(subscribeIcons, iconsVersion, iconsVersion);
  return appIcon(name);
}
