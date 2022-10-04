export const encodeLinkedinUriComponent = (component: string): string => component.replace(
    /[^A-Za-z0-9]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  )
  .replaceAll("%5F", "_")
  .replaceAll('%2D', '-');
