import degit from "tiged";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import childProcess from "child_process";
import { writeFileSync } from "fs";
import path from "path";
import inquirer from "inquirer";

const LANGUAGES = ["javascript", "typescript"] as const;
type Language = (typeof LANGUAGES)[number];

const LANGUAGE_NAMES: Record<Language, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
} as const;

const LANGUAGE_SHORTHANDS = {
  js: "javascript",
  ts: "typescript",
} as const;
type LanguageShorthand = keyof typeof LANGUAGE_SHORTHANDS;

function getLanguage(lang: Language | LanguageShorthand): Language {
  return lang in LANGUAGE_SHORTHANDS
    ? LANGUAGE_SHORTHANDS[lang as LanguageShorthand]
    : (lang as Language);
}

const TEMPLATES: Record<Language, readonly string[]> = {
  javascript: [
    "basic",
    "account-migration",
    "github-issue-editor",
    "metrics-notifier",
    "refund-charges",
    "user-settings",
    "web-screenshot-comparison",
    "qr-codes",
  ],
  typescript: [
    "basic",
    "account-migration",
    "github-issue-editor",
    "metrics-notifier",
    "refund-charges",
    "user-settings",
    "web-screenshot-comparison",
    "qr-codes",
  ],
} as const;
type Template = (typeof TEMPLATES)[Language][number];

// yargs types don't seem to autogenerate properly for commands
interface ChronicalsAppArgs {
  destination: string;
  personal_development_key: string;
  language: Language;
  template: Template;
  force: boolean;
  verbose: boolean;
}

async function clone(args: ChronicalsAppArgs) {
  const emitter = degit(
    `chronicals/examples/${args.template}/${args.language}`,
    {
      force: args.force,
      verbose: args.verbose,
    }
  );

  if (args.verbose) {
    emitter.on("info", (event) => {
      console.info(event.message.replace("options.", "--"));
    });
  }

  emitter.on("warn", (event) => {
    console.error(event.message.replace("options.", "--"));
  });

  await emitter.clone(args.destination);
}

function gitInit(path: string) {
  childProcess.execSync(
    'git init && git add -A && git commit -m "Initial commit from create-chronicals-app"',
    {
      cwd: path,
    }
  );
}

function hasCommandInstalled(command: string) {
  try {
    childProcess.execSync(`command -v ${command}`).toString();
    return true;
  } catch (e) {
    return false;
  }
}

const PACKAGE_MANAGERS = ["npm", "yarn"] as const;
type PackageManager = (typeof PACKAGE_MANAGERS)[number];

function getPackageManager(language: Language): PackageManager {
  return hasCommandInstalled("yarn") ? "yarn" : "npm";
}

const INSTALL_COMMANDS: Record<PackageManager, string> = {
  npm: "npm install --no-fund && rm yarn.lock",
  yarn: "yarn install",
} as const;

function getStartCommands(
  language: Language,
  packageManager: PackageManager
): string[] {
  const commands: Record<Language, Record<PackageManager, string[]>> = {
    javascript: {
      npm: ["npm start"],
      yarn: ["yarn start"],
    },
    typescript: {
      npm: ["npm run dev"],
      yarn: ["yarn dev"],
    },
  };

  return commands[language][packageManager];
}

async function main() {
  const args = (await yargs(hideBin(process.argv))
    .command<ChronicalsAppArgs>(
      "$0 [destination]",
      "Create Chronicals App",
      (yargs) => {
        yargs
          .positional("destination", {
            description: "Path where the Chronicals app should be created",
            type: "string",
          })
          .option("template", {
            description: "The Chronicals app template to use",
            alias: "t",
            choices: Array.from(
              new Set(LANGUAGES.flatMap((language) => TEMPLATES[language]))
            ),
          })
          .option("language", {
            description: "JavaScript or TypeScript",
            alias: "l",
            choices: [...LANGUAGES, ...Object.keys(LANGUAGE_SHORTHANDS)],
          })
          .option("personal_development_key", {
            description:
              "Your Personal Development API Key. For security reasons, Live mode keys may not be passed using this option.",
            alias: "pdk",
            type: "string",
          })
          .option("force", {
            boolean: true,
            description: "Overwrite the destination if it already exists",
            default: false,
          })
          .option("verbose", {
            alias: "v",
            boolean: true,
            description: "Enable verbose logging",
            default: false,
          })
          .help()
          .alias("h", "help");
      }
    )
    .strict()
    .parse()) as unknown as ChronicalsAppArgs;

  const questions: any[] = [];

  if (!args.destination) {
    questions.push({
      type: "input",
      name: "destination",
      message: "Where would you like to create your app?",
      default: "./chronicals",
    });
  }

  if (!args.language) {
    const languages = args.template
      ? LANGUAGES.filter((language) =>
          TEMPLATES[language].includes(args.template)
        )
      : LANGUAGES;

    if (languages.length === 1) {
      args.language = languages[0];
    } else {
      questions.push({
        type: "list",
        name: "language",
        message: "What language would you like to use?",
        default: "typescript",
        choices: languages.map((language) => ({
          name: LANGUAGE_NAMES[language],
          value: language,
        })),
      });
    }
  }

  const answers = await inquirer.prompt(questions);

  if (answers.destination) {
    args.destination = answers.destination;
  }

  if (answers.language) {
    args.language = answers.language;
  }

  args.language = getLanguage(args.language);

  if (!args.template) {
    const templateAnswers = await inquirer.prompt({
      type: "list",
      name: "template",
      message: "What template would you like to use?",
      default: "basic",
      choices: TEMPLATES[args.language].map((t: any) => ({
        name: t,
        value: t,
      })),
    });

    if (templateAnswers.template) {
      args.template = templateAnswers.template;
    }
  }

  const languageTemplates = TEMPLATES[args.language];

  if (!languageTemplates.includes(args.template)) {
    console.error(
      `Invalid template: ${
        args.template
      }. Must be one of ${languageTemplates.join(", ")}.`
    );
  }

  const langName = LANGUAGE_NAMES[args.language];

  console.log();
  console.log(
    `Creating a ${langName} Chronicals app with the ${args.template} template...`
  );
  console.log();

  console.log("Fetching app template...");

  try {
    await clone(args);
  } catch (err) {
    const message =
      err instanceof Error ? err.message.replace("options.", "--") : err;

    console.error("Failed to clone Chronicals app template:", message);

    if (args.verbose && message !== err) {
      console.error(err);
    }

    return;
  }

  const pdk = args.personal_development_key;
  if (pdk && !pdk.includes("_dev_")) {
    console.error(`Invalid Personal development API key: ${pdk}`);
    return process.exit(1);
  }

  writeFileSync(
    path.join(args.destination, ".env"),
    `CHRONICALS_KEY=${pdk || ""}`
  );

  console.log("Installing dependencies...");

  const packageManager = getPackageManager(args.language);
  const installCommand = INSTALL_COMMANDS[packageManager];

  try {
    childProcess.execSync(installCommand, {
      cwd: args.destination,
      stdio: "inherit",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : err;
    console.error("Failed installing dependencies:", message);
  }

  console.log("Initializing git repository...");

  // initializing git should happen _after_ install and moving .env so that files from those commands get appropriately committed.
  try {
    gitInit(args.destination);
  } catch (err) {
    const message = err instanceof Error ? err.message : err;
    console.error("Failed to initialize git directory:", message);

    if (args.verbose && message !== err) {
      console.error(err);
    }
  }

  console.log();
  console.log(`✨ Created new ${langName} Chronicals app.`);
  console.log();

  try {
    const startCommands = getStartCommands(args.language, packageManager);
    const lines = [
      "To run your app:",
      `1. cd ${args.destination}`,
      ...startCommands.map((command, i) => `${i + 2}. ${command}`),
    ];

    console.log(lines.join("\n"));
    console.log();
  } catch (err) {
    const message = err instanceof Error ? err.message : err;
    console.error("Failed generating start steps:", message);

    process.exit(1);
  }

  process.exit(0);
}

main().catch(console.error);
