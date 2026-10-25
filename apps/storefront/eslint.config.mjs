import { createBaseConfig } from '@app/config-eslint/base';
import nextVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = [...nextVitals, ...createBaseConfig(import.meta.dirname)];

export default eslintConfig;
