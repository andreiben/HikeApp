import { useQuery } from "@tanstack/react-query";
import { getRoutes, getRouteById } from "../services/api";

export function useRoutes() {
  return useQuery({
    queryKey: ["routes"],
    queryFn: getRoutes,
  });
}

export function useRoute(routeId: string) {
  return useQuery({
    queryKey: ["routes", routeId],
    queryFn: () => getRouteById(routeId),
    enabled: !!routeId,
  });
}