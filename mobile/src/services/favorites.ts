import { api } from "../services/api";
import { getAccessToken } from "../services/authStorage";

type FavoriteIdsResponse = {
  routeIds?: unknown;
};

function getAuthHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function fetchFavoriteIds(): Promise<string[]> {
  const token = await getAccessToken();
  if (!token) return [];

  const response = await api.get<FavoriteIdsResponse>("/favorites/ids", {
    headers: getAuthHeaders(token),
  });

  return Array.isArray(response.data?.routeIds)
    ? response.data.routeIds.filter(
        (routeId: unknown): routeId is string => typeof routeId === "string"
      )
    : [];
}

export async function addFavorite(routeId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Missing access token");
  }

  await api.post(`/favorites/${routeId}`, undefined, {
    headers: getAuthHeaders(token),
  });
}

export async function removeFavorite(routeId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Missing access token");
  }

  await api.delete(`/favorites/${routeId}`, {
    headers: getAuthHeaders(token),
  });
}
