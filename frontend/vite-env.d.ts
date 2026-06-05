/// <reference types="vite/client" />

declare module "*.stl?url" {
  const src: string;
  export default src;
}
