export async function panelNavigate(href: string): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const { navigate } = await import('astro:transitions/client');
    navigate(href);
    return;
  } catch {
    window.location.assign(href);
  }
}
