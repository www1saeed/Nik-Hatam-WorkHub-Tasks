<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Minishlink\WebPush\VAPID;
use Symfony\Component\Process\Process;
use Throwable;

class GenerateVapidKeysCommand extends Command
{
    /**
     * Command signature.
     *
     * Options:
     * - --subject   Custom VAPID subject (mailto:... or https://...)
     * - --write-env Write generated values directly into backend/.env
     * - --force     Allow overwriting existing VAPID_* values in .env
     *
     * Examples:
     * - php artisan push:vapid-generate
     * - php artisan push:vapid-generate --subject="mailto:ops@example.com" --write-env
     * - php artisan push:vapid-generate --write-env --force
     */
    protected $signature = 'push:vapid-generate
        {--subject= : VAPID subject (mailto:... or https://...)}
        {--write-env : Persist generated keys into .env}
        {--force : Overwrite existing VAPID values in .env when used with --write-env}';

    /**
     * Short description used in `php artisan list`.
     */
    protected $description = 'Generate Web Push VAPID key pair (and optionally write to .env).';

    /**
     * Execute command.
     */
    public function handle(): int
    {
        // Generate VAPID keys with OpenSSL fallback handling.
        // On some Windows setups PHP points to a missing openssl.cnf, which
        // causes `Unable to create the key`. We handle that case automatically.
        $keys = $this->generateKeysWithOpenSslFallback();
        if ($keys === null) {
            return self::FAILURE;
        }
        $publicKey = (string) ($keys['publicKey'] ?? '');
        $privateKey = (string) ($keys['privateKey'] ?? '');

        if ($publicKey === '' || $privateKey === '') {
            $this->error('Failed to generate VAPID keys.');

            return self::FAILURE;
        }

        // Resolve subject from option or sensible default.
        $subject = trim((string) $this->option('subject'));
        if ($subject === '') {
            $subject = 'mailto:admin@example.com';
        }

        // Always print generated values so caller can copy/paste when needed.
        $this->newLine();
        $this->line('Generated VAPID values:');
        $this->line("VAPID_PUBLIC_KEY={$publicKey}");
        $this->line("VAPID_PRIVATE_KEY={$privateKey}");
        $this->line("VAPID_SUBJECT={$subject}");
        $this->newLine();

        // Optional path: persist values directly into backend/.env.
        if ((bool) $this->option('write-env')) {
            $result = $this->writeEnvValues($publicKey, $privateKey, $subject, (bool) $this->option('force'));
            if ($result !== self::SUCCESS) {
                return $result;
            }

            $this->info('VAPID values were written to .env.');
            $this->line('Run `php artisan config:clear` to refresh loaded config values.');
        }

        return self::SUCCESS;
    }

    /**
     * Generate keys and recover from missing OpenSSL config on Windows.
     *
     * Strategy:
     * 1) try library default generation
     * 2) on failure, create a minimal local OpenSSL 3 config file
     * 3) set OPENSSL_CONF for current process and retry once
     *
     * @return array{publicKey:string,privateKey:string}|null
     */
    private function generateKeysWithOpenSslFallback(): ?array
    {
        try {
            return VAPID::createVapidKeys();
        } catch (Throwable $firstError) {
            // Continue to fallback path below.
        }

        // Second attempt: use common OpenSSL config locations for Windows PHP
        // distributions (e.g. C:\Program Files\php\...\extras\ssl\openssl.cnf).
        //
        // Important: OPENSSL_CONF must be present before PHP process startup for
        // some builds. Therefore we test candidate paths in a child process that
        // starts with OPENSSL_CONF in its environment.
        $candidatePaths = $this->candidateOpenSslConfigPaths();
        foreach ($candidatePaths as $candidatePath) {
            $generated = $this->tryGenerateInSubprocess($candidatePath);
            if ($generated !== null) {
                return $generated;
            }
        }

        $fallbackPath = storage_path('framework/openssl-vapid.cnf');
        $fallbackContent = <<<CNF
openssl_conf = openssl_init

[openssl_init]
providers = provider_sect

[provider_sect]
default = default_sect

[default_sect]
activate = 1

CNF;

        // Ensure fallback config exists for current process retry.
        if (! is_file($fallbackPath)) {
            $dir = dirname($fallbackPath);
            if (! is_dir($dir)) {
                @mkdir($dir, 0777, true);
            }
            @file_put_contents($fallbackPath, $fallbackContent);
        }

        if (! is_file($fallbackPath)) {
            $this->error('Failed to create fallback OpenSSL config file.');
            $this->line('Expected path: ' . $fallbackPath);
            $this->line('Please create a valid openssl.cnf and set OPENSSL_CONF before running this command.');

            return null;
        }

        $generated = $this->tryGenerateInSubprocess($fallbackPath);
        if ($generated !== null) {
            return $generated;
        }

        try {
            // Final direct attempt for completeness in environments where runtime
            // setenv may still be respected.
            putenv('OPENSSL_CONF=' . $fallbackPath);
            return VAPID::createVapidKeys();
        } catch (Throwable $error) {
            $this->error('Unable to create VAPID keys (OpenSSL key generation failed).');
            $this->line('Resolved fallback OPENSSL_CONF: ' . $fallbackPath);
            $this->line('Error: ' . $error->getMessage());
            $this->newLine();
            $this->line('Troubleshooting:');
            $this->line('1) Ensure PHP OpenSSL extension is enabled.');
            $this->line('2) Ensure OpenSSL 3 default provider is available on this host.');
            $this->line('3) Export a working OPENSSL_CONF and retry this command.');

            return null;
        } finally {
            putenv('OPENSSL_CONF');
        }
    }

    /**
     * Build potential openssl.cnf file paths from runtime context.
     *
     * @return array<int, string>
     */
    private function candidateOpenSslConfigPaths(): array
    {
        $candidates = [];

        // Path from current PHP executable installation.
        $phpBaseDir = dirname(PHP_BINARY);
        $candidates[] = $phpBaseDir . DIRECTORY_SEPARATOR . 'extras' . DIRECTORY_SEPARATOR . 'ssl' . DIRECTORY_SEPARATOR . 'openssl.cnf';

        // Path from loaded php.ini folder (neighbor install layout).
        $loadedIni = php_ini_loaded_file();
        if (is_string($loadedIni) && $loadedIni !== '') {
            $iniDir = dirname($loadedIni);
            $candidates[] = $iniDir . DIRECTORY_SEPARATOR . 'extras' . DIRECTORY_SEPARATOR . 'ssl' . DIRECTORY_SEPARATOR . 'openssl.cnf';
        }

        // Explicit env/config path if already provided externally.
        $existingEnv = getenv('OPENSSL_CONF');
        if (is_string($existingEnv) && trim($existingEnv) !== '') {
            $candidates[] = trim($existingEnv);
        }

        // Remove duplicates while preserving order.
        $unique = [];
        foreach ($candidates as $path) {
            $normalized = trim((string) $path);
            if ($normalized === '' || in_array($normalized, $unique, true)) {
                continue;
            }
            $unique[] = $normalized;
        }

        return $unique;
    }

    /**
     * Attempt VAPID generation with one explicit OPENSSL_CONF path.
     *
     * @return array{publicKey:string,privateKey:string}|null
     */
    private function tryGenerateInSubprocess(string $path): ?array
    {
        if (! is_file($path)) {
            return null;
        }

        $autoloadPath = var_export(base_path('vendor/autoload.php'), true);
        $script = <<<PHP
require {$autoloadPath};
\$keys = \\Minishlink\\WebPush\\VAPID::createVapidKeys();
echo json_encode(\$keys, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
PHP;
        $process = new Process(
            [PHP_BINARY, '-r', $script],
            base_path(),
            ['OPENSSL_CONF' => $path]
        );
        $process->run();

        try {
            if (! $process->isSuccessful()) {
                return null;
            }

            $decoded = json_decode(trim($process->getOutput()), true);
            if (! is_array($decoded)) {
                return null;
            }

            $publicKey = (string) ($decoded['publicKey'] ?? '');
            $privateKey = (string) ($decoded['privateKey'] ?? '');
            if ($publicKey === '' || $privateKey === '') {
                return null;
            }

            return [
                'publicKey' => $publicKey,
                'privateKey' => $privateKey,
            ];
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * Persist VAPID_* keys into .env.
     *
     * Behavior:
     * - Without `--force`, refuses to overwrite existing non-empty VAPID values.
     * - With `--force`, updates existing values in place.
     * - Missing keys are appended to file end.
     */
    private function writeEnvValues(string $publicKey, string $privateKey, string $subject, bool $force): int
    {
        $envPath = base_path('.env');
        if (! is_file($envPath)) {
            $this->error('.env file not found. Create it first (e.g. copy .env.example to .env).');

            return self::FAILURE;
        }

        $content = file_get_contents($envPath);
        if (! is_string($content)) {
            $this->error('Failed to read .env file.');

            return self::FAILURE;
        }

        // If values already exist and overwrite is not explicitly allowed,
        // we abort to prevent accidental key rotation in production.
        if (! $force) {
            $hasExisting = $this->hasNonEmptyEnvValue($content, 'VAPID_PUBLIC_KEY')
                || $this->hasNonEmptyEnvValue($content, 'VAPID_PRIVATE_KEY')
                || $this->hasNonEmptyEnvValue($content, 'VAPID_SUBJECT');

            if ($hasExisting) {
                $this->warn('Existing VAPID values found in .env. Re-run with --force to overwrite.');

                return self::FAILURE;
            }
        }

        $updated = $this->upsertEnvValue($content, 'VAPID_PUBLIC_KEY', $publicKey);
        $updated = $this->upsertEnvValue($updated, 'VAPID_PRIVATE_KEY', $privateKey);
        $updated = $this->upsertEnvValue($updated, 'VAPID_SUBJECT', $subject);

        $writeResult = file_put_contents($envPath, $updated);
        if ($writeResult === false) {
            $this->error('Failed to write .env file.');

            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    /**
     * Check whether an env key exists with a non-empty value.
     */
    private function hasNonEmptyEnvValue(string $content, string $key): bool
    {
        $pattern = '/^' . preg_quote($key, '/') . '=(.*)$/m';
        if (! preg_match($pattern, $content, $matches)) {
            return false;
        }

        return trim((string) ($matches[1] ?? '')) !== '';
    }

    /**
     * Insert or replace one env key=value entry.
     *
     * Uses line-based replacement to keep surrounding file content intact.
     */
    private function upsertEnvValue(string $content, string $key, string $value): string
    {
        $line = $key . '=' . $value;
        $pattern = '/^' . preg_quote($key, '/') . '=.*$/m';

        if (preg_match($pattern, $content) === 1) {
            return (string) preg_replace($pattern, $line, $content);
        }

        $suffix = str_ends_with($content, PHP_EOL) ? '' : PHP_EOL;

        return $content . $suffix . $line . PHP_EOL;
    }
}
