const [, , commandName = "command", reason = "This command is not implemented yet."] =
  Bun.argv;

console.log(`${commandName} deferred: ${reason}`);
