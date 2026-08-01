export async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return data.error ?? 'Ocurrió un error';
  } catch {
    return 'Ocurrió un error';
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json() as Promise<T>;
}
