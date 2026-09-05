import axios from "axios";
import type { HikeRoute } from "../types/route";

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const isTimeout =
      (error as { code?: string })?.code === "ECONNABORTED" ||
      (error as { message?: string })?.message?.includes("timeout");
    if (isTimeout) {
      return Promise.reject(
        Object.assign(
          new Error(
            `Cannot reach the server at ${process.env.EXPO_PUBLIC_API_URL ?? 'unknown'}. If testing on a phone, deploy the backend to Railway and update EXPO_PUBLIC_API_URL.`
          ),
          { code: "TIMEOUT" }
        )
      );
    }
    const isNetworkError =
      (error as { message?: string })?.message === "Network Error";
    if (isNetworkError) {
      return Promise.reject(
        Object.assign(
          new Error("Network error. Check your Wi-Fi connection and try again."),
          { code: "NETWORK_ERROR" }
        )
      );
    }
    return Promise.reject(error);
  }
);

type GetRoutesResponse = {
  routes: Route[];
};

type GetRouteByIdResponse = {
  route: Route;
};

export type Route = HikeRoute & {
  tags?: string[] | null;
  description?: string | null;
  bestSeason?: string | null;
  condition?: string | null;
};

export async function getRoutes(): Promise<Route[]> {
  const response = await api.get<GetRoutesResponse>("/routes");
  return response.data.routes;
}

export async function getRouteById(routeId: string): Promise<Route> {
  const response = await api.get<GetRouteByIdResponse>(`/routes/${routeId}`);
  return response.data.route;
}
