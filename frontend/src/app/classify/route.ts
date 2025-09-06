import { NextResponse } from "next/server";
import PipelineSingleton from "./pipeline";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const text = url.searchParams.get("text");
  if (!text) {
    return NextResponse.json(
      { error: "Missing text parameter" },
      { status: 400 },
    );
  }
  const classifier = await PipelineSingleton.getInstance();
  const result = await classifier(text);
  return NextResponse.json(result);
}
