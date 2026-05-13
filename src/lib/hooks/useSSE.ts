import { useEffect, useRef } from "react";

export function useSSE(onEvent: (event: string, data: any) => void) {
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
    };

    Object.entries(handlers).forEach(([name, handler]) => {
      eventSource.addEventListener(name, handler as any);
    });

    eventSource.onerror = (err) => {
      console.error("SSE Error:", err);
    };

    return () => {
      eventSource.close();
    };
  }, []);
}
