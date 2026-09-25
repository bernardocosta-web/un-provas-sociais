// Única fonte das URLs da stack LOCAL do Supabase nos testes (vitest e e2e).
// Portas abaixo de 49152 de propósito: o Windows (winnat/Hyper-V) reserva
// faixas dentro da faixa dinâmica (49152-65535) e chegou a reservar
// 54245-54344, onde ficavam as portas padrão (54321/54322). Precisam bater
// com supabase/config.toml — testes/repo/portas_locais.test.js confere.
export const URL_API = 'http://127.0.0.1:44321'
export const URL_BANCO = 'postgresql://postgres:postgres@127.0.0.1:44322/postgres'
