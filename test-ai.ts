import { generateText } from "ai";
import { customAi } from "./src/lib/ai";

async function main() {
  try {
    const { text } = await generateText({
      model: customAi.chat("gemma4:31b-cloud"),
      prompt: "Hello",
    });
    console.log("Success:", text);
  } catch (e) {
    console.error("Error:", e);
  }
}
main();
