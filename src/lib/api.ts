import type { FluxNodeData, GanttRow, Workflow, WorkflowSummary } from "../types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (response.status === 204) return undefined as T;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  listWorkflows: () => request<WorkflowSummary[]>("/api/workflows"),
  getWorkflow: (id: string) => request<Workflow>(`/api/workflows/${id}`),
  createWorkflow: (name: string, options?: { parentWorkflowId?: string; subprocess?: boolean }) =>
    request<Workflow>("/api/workflows", {
      method: "POST",
      body: JSON.stringify({
        name,
        parentWorkflowId: options?.parentWorkflowId,
        subprocess: options?.subprocess,
      }),
    }),
  renameWorkflow: (id: string, name: string, description?: string) =>
    request<Workflow>(`/api/workflows/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, description }),
    }),
  setParentWorkflow: (id: string, parentWorkflowId: string | null) =>
    request<Workflow>(`/api/workflows/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ parentWorkflowId }),
    }),
  saveGraph: (
    id: string,
    payload: {
      upsertNodes: unknown[];
      deleteNodeIds: string[];
      upsertEdges: unknown[];
      deleteEdgeIds: string[];
      viewport?: { x: number; y: number; zoom: number };
      parentWorkflowId?: string | null;
      senderId: string;
    },
  ) =>
    request<Workflow>(`/api/workflows/${id}/graph`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteWorkflow: (id: string) =>
    request<void>(`/api/workflows/${id}`, { method: "DELETE" }),
  copyWorkflow: (id: string) =>
    request<Workflow>(`/api/workflows/${id}/copy`, { method: "POST" }),
  uploadFile: async (workflowId: string, file: File) => {
    const query = `?name=${encodeURIComponent(file.name)}`;
    const response = await fetch(`/api/workflows/${workflowId}/files${query}`, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-Filename": file.name,
      },
      body: file,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed (${response.status})`);
    }
    return response.json() as Promise<{
      id: string;
      name: string;
      url: string;
      size: number;
      mime: string;
    }>;
  },
  deleteFile: (workflowId: string, fileId: string) =>
    request<void>(`/api/files/${workflowId}/${fileId}`, { method: "DELETE" }),
  gantt: (id: string, pathway = "") => {
    const query = pathway ? `?pathway=${encodeURIComponent(pathway)}` : "";
    return request<{ rows: GanttRow[]; totalDays: number }>(`/api/workflows/${id}/gantt${query}`);
  },
};

export type { FluxNodeData };
