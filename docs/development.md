# Разработка и тесты

Команды из папки `app/`:

```bash
npm run typecheck   # проверка типов
npm run build       # сборка main + renderer в out/
npm test            # все unit-тесты
npm test -- nodeLlama
npm run test:e2e    # Playwright + Electron
npm run lint
```

Интеграционные тесты `nodeLlama` пропускаются без `TEST_GGUF_PATH`:

```bash
TEST_GGUF_PATH=/path/to/model.gguf npm test -- nodeLlama
```

После `npm install` нативный модуль: `npm run rebuild`.

Подробности архитектуры — [architecture.md](architecture.md), [вики](https://github.com/rkfsociety/CodeViper/wiki/Архитектура). Назад в [README](../README.md).
