// Hermes provides atob/btoa but they're not in the default RN tsconfig libs
declare function atob(encoded: string): string
declare function btoa(input: string): string

declare module "*.png" {
  const value: any
  export default value
}
declare module "*.css" {
  const value: any
  export default value
}
declare module "*.js" {
  const value: any
  export default value
}
