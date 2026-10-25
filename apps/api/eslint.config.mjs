import { createBaseConfig } from '@app/config-eslint/base';

const eslintConfig = [{ ignores: ['src/generated/**'] }, ...createBaseConfig(import.meta.dirname)];

export default eslintConfig;
