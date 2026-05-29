import "dotenv/config" // load .env before ./app reads process.env at import time
import { app } from "./app"

const PORT = Number(process.env.PORT) || 3000

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} at ${new Date().toISOString()}`)
})
