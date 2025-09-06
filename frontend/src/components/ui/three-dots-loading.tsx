"use client";

export function ThreeDotsLoading() {
  return (
    <div className="flex space-x-1.5 justify-center items-center h-full">
      <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
      <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce"></div>
    </div>
  );
}
