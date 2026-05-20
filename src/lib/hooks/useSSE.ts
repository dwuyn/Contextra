import { useEffect, useRef } from "react";

type SSEPayload = Record<string, unknown>;

export function useSSE(onEvent: (event: string, data: SSEPayload) => void) {
  const callbackRef = useRef(onEvent);
  
  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const eventSource = new EventSource("/api/realtime");

    const handlers = {
      new_message: (e: MessageEvent) => callbackRef.current("new_message", JSON.parse(e.data)),
      new_friend_request: (e: MessageEvent) => callbackRef.current("new_friend_request", JSON.parse(e.data)),
      friend_request_status_update: (e: MessageEvent) => callbackRef.current("friend_request_status_update", JSON.parse(e.data)),
      project_invite_created: (e: MessageEvent) => callbackRef.current("project_invite_created", JSON.parse(e.data)),
      project_invite_updated: (e: MessageEvent) => callbackRef.current("project_invite_updated", JSON.parse(e.data)),
      project_member_removed: (e: MessageEvent) => callbackRef.current("project_member_removed", JSON.parse(e.data)),
      project_access_revoked: (e: MessageEvent) => callbackRef.current("project_access_revoked", JSON.parse(e.data)),
      project_presence_updated: (e: MessageEvent) => callbackRef.current("project_presence_updated", JSON.parse(e.data)),
      project_comment_created: (e: MessageEvent) => callbackRef.current("project_comment_created", JSON.parse(e.data)),
      project_comment_updated: (e: MessageEvent) => callbackRef.current("project_comment_updated", JSON.parse(e.data)),
    };

    Object.entries(handlers).forEach(([name, handler]) => {
      eventSource.addEventListener(name, handler);
    });

    eventSource.onerror = (err) => {
      console.error("SSE Error:", err);
    };

    return () => {
      eventSource.close();
    };
  }, []);
}
