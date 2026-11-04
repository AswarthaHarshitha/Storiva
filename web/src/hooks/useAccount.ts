import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { clearOfflineData } from "../offline/store";
import type { Account } from "../api/types";

export const accountKey = ["account"] as const;

/** The signed-in account, or null when there is no valid session. */
export function useAccount() {
  return useQuery({
    queryKey: accountKey,
    queryFn: async () => {
      try {
        return await api.get<Account>("/auth/me");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: Infinity,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) => api.post<Account>("/auth/login", credentials),
    onSuccess: (account) => {
      queryClient.clear();
      queryClient.setQueryData(accountKey, account);
    },
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string; confirmPassword: string; organizationName: string }) =>
      api.post<Account>("/auth/signup", input),
    onSuccess: (account) => {
      queryClient.clear();
      queryClient.setQueryData(accountKey, account);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<undefined>("/auth/logout"),
    // Clear cached inventory so nothing from this organization lingers for the next person.
    onSettled: () => {
      void clearOfflineData();
      queryClient.clear();
      queryClient.setQueryData(accountKey, null);
    },
  });
}
