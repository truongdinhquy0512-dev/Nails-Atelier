import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../auth/AuthProvider";

type Design = { id: number; title: string; status: string; nailShape: string; nailLength: string; budgetMax: string;
  customNotes: string; quotedPrice: string | null; quoteNote: string | null; rejectionReason: string | null;
  createdAt: string; images: { id: number }[] };

const root = "/custom-design-requests";
const guard = { headers: { "X-Atelier-Upload": "1" } };

export const useCustomDesign = () => {
  const { user } = useAuth();
  const [designs, setDesigns] = useState<Design[]>([]);
  const [designError, setDesignError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    const result = await apiClient.get<Design[]>(`${root}/my`, { signal });
    if (!signal?.aborted) setDesigns(result.data);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setDesigns([]);
    setDesignError("");
    if (user) void load(c.signal).catch(err => { if (!c.signal.aborted) setDesignError(err.message); });
    return () => c.abort();
  }, [user?.id, load]);
  return {
    user, designError,
    customRequests: designs.map(d => ({
      id: d.id, title: d.title, status: d.status, nailShape: d.nailShape, nailLength: d.nailLength,
      budget: Number(d.budgetMax), notes: d.customNotes, quotedPrice: Number(d.quotedPrice) || null,
      adminResponse: d.rejectionReason || d.quoteNote, submittedAt: new Date(d.createdAt).toLocaleDateString("vi-VN"),
      referenceImage: d.images[0] ? `/api${root}/images/${d.images[0].id}` : "/images/atelier-silk-prism.jpg",
    })),
    async createDesign(input: Record<string, unknown>, images: File[]) {
      const data = new FormData();
      data.append("design", JSON.stringify(input));
      images.forEach(image => data.append("images", image));
      await apiClient.post(root, data, guard);
      await load();
    },
    async respond(id: number, accept: boolean) {
      const result = await apiClient.patch<{ orderCode: string } | null>(`${root}/${id}/respond`, { accept }, guard);
      await load();
      return result.data;
    },
  };
};
