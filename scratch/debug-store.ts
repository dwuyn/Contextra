import { createStore } from "zustand/vanilla";
import { persist } from "zustand/middleware";
const store = createStore(persist(() => ({ value: 1 }), { name: "test" }));
console.log("vanilla store keys:", Object.keys(store));
console.log("vanilla store persist:", (store as any).persist);
