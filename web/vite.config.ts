import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FACTORY_DIR = path.join(homedir(), '.factory')
const OROIO_DIR = path.join(homedir(), '.oroio')

function oroioDataPlugin() {
  return {
    name: 'oroio-data',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url?.startsWith('/data/')) {
          const fileName = req.url.replace('/data/', '')
          const filePath = path.join(homedir(), '.oroio', fileName)
          
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/octet-stream')
            fs.createReadStream(filePath).pipe(res)
          } else {
            res.statusCode = 404
            res.end('Not found')
          }
          return
        }
        next()
      })
    },
  }
}

function factoryApiPlugin() {
  return {
    name: 'factory-api',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/api/')) return next()
        
        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', async () => {
          try {
            const data = body ? JSON.parse(body) : {}
            const sendJson = (obj: any) => {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(obj))
            }
            
            // Skills
            if (req.url === '/api/skills/list') {
              const skillsDir = path.join(FACTORY_DIR, 'skills')
              const skills: any[] = []
              try {
                const realDir = fs.realpathSync(skillsDir)
                for (const entry of fs.readdirSync(realDir, { withFileTypes: true })) {
                  const entryPath = path.join(realDir, entry.name)
                  if (fs.statSync(entryPath).isDirectory()) {
                    const skillFile = path.join(entryPath, 'SKILL.md')
                    if (fs.existsSync(skillFile)) {
                      skills.push({ name: entry.name, path: skillFile })
                    }
                  }
                }
              } catch {}
              return sendJson(skills)
            }
            if (req.url === '/api/skills/create') {
              const skillDir = path.join(FACTORY_DIR, 'skills', data.name)
              fs.mkdirSync(skillDir, { recursive: true })
              fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# ${data.name}\n\nDescribe your skill instructions here.\n`)
              return sendJson({ success: true })
            }
            if (req.url === '/api/skills/delete') {
              fs.rmSync(path.join(FACTORY_DIR, 'skills', data.name), { recursive: true, force: true })
              return sendJson({ success: true })
            }
            
            // Commands
            const parseCommandFile = (content: string) => {
              let description = ''
              let body = content
              if (content.startsWith('---')) {
                const endIdx = content.indexOf('---', 3)
                if (endIdx !== -1) {
                  const frontmatter = content.slice(3, endIdx)
                  const descMatch = frontmatter.match(/description:\s*(.+)/)
                  if (descMatch) description = descMatch[1].trim()
                  body = content.slice(endIdx + 3).trim()
                }
              }
              return { description, content: body }
            }
            
            if (req.url === '/api/commands/list') {
              const commandsDir = path.join(FACTORY_DIR, 'commands')
              const commands: any[] = []
              try {
                const realDir = fs.realpathSync(commandsDir)
                for (const entry of fs.readdirSync(realDir)) {
                  if (entry.endsWith('.md')) {
                    const fullPath = path.join(realDir, entry)
                    if (fs.statSync(fullPath).isFile()) {
                      const raw = fs.readFileSync(fullPath, 'utf-8')
                      const { description, content } = parseCommandFile(raw)
                      commands.push({ name: entry.slice(0, -3), path: fullPath, description, content })
                    }
                  }
                }
              } catch {}
              return sendJson(commands)
            }
            if (req.url === '/api/commands/create') {
              const commandsDir = path.join(FACTORY_DIR, 'commands')
              fs.mkdirSync(commandsDir, { recursive: true })
              fs.writeFileSync(path.join(commandsDir, `${data.name}.md`), `---
description: Description of your command
---

# /${data.name}

Command instructions here.
`)
              return sendJson({ success: true })
            }
            if (req.url === '/api/commands/delete') {
              fs.unlinkSync(path.join(FACTORY_DIR, 'commands', `${data.name}.md`))
              return sendJson({ success: true })
            }
            if (req.url === '/api/commands/content') {
              const commandsDir = path.join(FACTORY_DIR, 'commands')
              try {
                const realDir = fs.realpathSync(commandsDir)
                const content = fs.readFileSync(path.join(realDir, `${data.name}.md`), 'utf-8')
                return sendJson({ content })
              } catch (e: any) {
                return sendJson({ error: e.message })
              }
            }
            if (req.url === '/api/commands/update') {
              const commandsDir = path.join(FACTORY_DIR, 'commands')
              try {
                const realDir = fs.realpathSync(commandsDir)
                fs.writeFileSync(path.join(realDir, `${data.name}.md`), data.content)
                return sendJson({ success: true })
              } catch (e: any) {
                return sendJson({ success: false, error: e.message })
              }
            }
            
            // Droids
            if (req.url === '/api/droids/list') {
              const droidsDir = path.join(FACTORY_DIR, 'droids')
              const droids: any[] = []
              try {
                const realDir = fs.realpathSync(droidsDir)
                for (const entry of fs.readdirSync(realDir)) {
                  if (entry.endsWith('.md')) {
                    const fullPath = path.join(realDir, entry)
                    if (fs.statSync(fullPath).isFile()) {
                      droids.push({ name: entry.slice(0, -3), path: fullPath })
                    }
                  }
                }
              } catch {}
              return sendJson(droids)
            }
            if (req.url === '/api/droids/create') {
              const droidsDir = path.join(FACTORY_DIR, 'droids')
              fs.mkdirSync(droidsDir, { recursive: true })
              fs.writeFileSync(path.join(droidsDir, `${data.name}.md`), `---\nname: ${data.name}\ndescription: A custom droid\n---\n\n# ${data.name}\n\nDroid instructions here.\n`)
              return sendJson({ success: true })
            }
            if (req.url === '/api/droids/delete') {
              fs.unlinkSync(path.join(FACTORY_DIR, 'droids', `${data.name}.md`))
              return sendJson({ success: true })
            }
            
            // MCP
            if (req.url === '/api/mcp/list') {
              const mcpFile = path.join(FACTORY_DIR, 'mcp.json')
              const servers: any[] = []
              try {
                const config = JSON.parse(fs.readFileSync(mcpFile, 'utf-8'))
                if (config.mcpServers) {
                  for (const [name, server] of Object.entries(config.mcpServers)) {
                    const s = server as any
                    servers.push({
                      name,
                      type: s.type || 'stdio',
                      command: s.command,
                      args: s.args || [],
                      url: s.url,
                      env: s.env || {}
                    })
                  }
                }
              } catch {}
              return sendJson(servers)
            }
            if (req.url === '/api/mcp/add') {
              const mcpFile = path.join(FACTORY_DIR, 'mcp.json')
              let config: any = { mcpServers: {} }
              try {
                config = JSON.parse(fs.readFileSync(mcpFile, 'utf-8'))
                if (!config.mcpServers) config.mcpServers = {}
              } catch {}
              config.mcpServers[data.name] = { type: 'stdio', command: data.command, args: data.args || [] }
              fs.mkdirSync(FACTORY_DIR, { recursive: true })
              fs.writeFileSync(mcpFile, JSON.stringify(config, null, 2))
              return sendJson({ success: true })
            }
            if (req.url === '/api/mcp/remove') {
              const mcpFile = path.join(FACTORY_DIR, 'mcp.json')
              try {
                const config = JSON.parse(fs.readFileSync(mcpFile, 'utf-8'))
                if (config.mcpServers?.[data.name]) {
                  delete config.mcpServers[data.name]
                  fs.writeFileSync(mcpFile, JSON.stringify(config, null, 2))
                }
              } catch {}
              return sendJson({ success: true })
            }
            if (req.url === '/api/mcp/update') {
              const mcpFile = path.join(FACTORY_DIR, 'mcp.json')
              let config: any = { mcpServers: {} }
              try {
                config = JSON.parse(fs.readFileSync(mcpFile, 'utf-8'))
                if (!config.mcpServers) config.mcpServers = {}
              } catch {}
              config.mcpServers[data.name] = data.config
              fs.mkdirSync(FACTORY_DIR, { recursive: true })
              fs.writeFileSync(mcpFile, JSON.stringify(config, null, 2))
              return sendJson({ success: true })
            }
            
            // BYOK (Custom Models)
            if (req.url === '/api/byok/list') {
              const configFile = path.join(FACTORY_DIR, 'config.json')
              try {
                const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
                return sendJson(config.custom_models || [])
              } catch {
                return sendJson([])
              }
            }
            if (req.url === '/api/byok/remove') {
              const configFile = path.join(FACTORY_DIR, 'config.json')
              try {
                const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
                if (config.custom_models && data.index >= 0 && data.index < config.custom_models.length) {
                  config.custom_models.splice(data.index, 1)
                  fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
                }
                return sendJson({ success: true })
              } catch {
                return sendJson({ success: true })
              }
            }
            if (req.url === '/api/byok/update') {
              const configFile = path.join(FACTORY_DIR, 'config.json')
              let config: any = {}
              try {
                config = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
              } catch {}
              if (!config.custom_models) config.custom_models = []
              if (data.index === -1) {
                config.custom_models.push(data.config)
              } else if (data.index >= 0 && data.index < config.custom_models.length) {
                config.custom_models[data.index] = data.config
              }
              fs.mkdirSync(FACTORY_DIR, { recursive: true })
              fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
              return sendJson({ success: true })
            }
            
            // DK config
            if (req.url === '/api/dk/config') {
              const configFile = path.join(OROIO_DIR, 'config')
              
              // Parse key=value format
              const parseConfig = (content: string): Record<string, string> => {
                const config: Record<string, string> = {}
                for (const line of content.split('\n')) {
                  const idx = line.indexOf('=')
                  if (idx > 0) {
                    config[line.slice(0, idx)] = line.slice(idx + 1)
                  }
                }
                return config
              }
              
              // Serialize to key=value format
              const serializeConfig = (config: Record<string, string>): string => {
                return Object.entries(config).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
              }
              
              // If data is provided, it's a SET operation
              if (Object.keys(data).length > 0) {
                try {
                  let existing: Record<string, string> = {}
                  try {
                    existing = parseConfig(fs.readFileSync(configFile, 'utf-8'))
                  } catch {}
                  const updated = { ...existing, ...data }
                  fs.mkdirSync(OROIO_DIR, { recursive: true })
                  fs.writeFileSync(configFile, serializeConfig(updated))
                  return sendJson({ success: true, config: updated })
                } catch (e: any) {
                  return sendJson({ success: false, error: e.message })
                }
              } else {
                // GET operation
                try {
                  let config: Record<string, string> = {}
                  try {
                    config = parseConfig(fs.readFileSync(configFile, 'utf-8'))
                  } catch {}
                  return sendJson(config)
                } catch (e: any) {
                  return sendJson({ error: e.message })
                }
              }
            }
            
            next()
          } catch (e: any) {
            res.statusCode = 500
            res.end(JSON.stringify({ success: false, error: e.message }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile({ removeViteModuleLoader: true }),
    oroioDataPlugin(),
    factoryApiPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
    },
  },
})
