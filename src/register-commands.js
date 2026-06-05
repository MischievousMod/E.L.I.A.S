import "dotenv/config";
import { REST, Routes } from "discord.js";
import { buildCommands } from "./commands.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.GUILD_ID?.trim();

if (!token || !clientId) {
  console.error("Set DISCORD_TOKEN and DISCORD_CLIENT_ID in .env");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);
const commands = buildCommands().map((command) => command.toJSON());

const commandList = commands.map((command) => `/${command.name}`).join(", ");

if (guildId) {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: commands,
  });
  await rest.put(Routes.applicationCommands(clientId), { body: [] });
  console.log(
    `Registered ${commandList} on guild ${guildId} and removed global commands.`
  );
} else {
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log(
    `Registered ${commandList} globally (can take up to an hour).`
  );
}
