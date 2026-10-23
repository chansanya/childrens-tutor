/**
 * 绘画模板：一个模板 = 一份 ComfyUI API 格式的工作流 + 提示词与种子写在哪个节点的哪个字段。
 * 控制台"绘画"菜单可以切换、编辑、新增模板，这里是内置的默认模板。
 */
export type Workflow =Record<string, { inputs: Record<string, unknown>; class_type?: string; _meta?: { title?: string } }>

export interface DrawTemplate {
  id: string
  name: string
  // 提示词语言，由工作流的文本编码器决定
  lang: 'en' | 'zh'
  style: string
  workflow: Workflow
  promptNode: string
  promptField: string
  seedNode?: string
  seedField?: string
}

const STYLE_EN = "children's picture book illustration, cute, bright colors, soft light, safe for kids"
const STYLE_ZH = '儿童绘本插画风格，可爱，色彩明亮，柔和光线，适合儿童'

// 内置模板（ComfyUI API 格式）。H3 的 megapixels 调为 1，加快出图、控制图片体积
export const DEFAULT_TEMPLATES: DrawTemplate[] = [
  {
    id: 'z-image-turbo',
    name: 'Z-Image Turbo（快速）',
    lang: 'zh',
    style: STYLE_ZH,
    promptNode: '57:27',
    promptField: 'text',
    seedNode: '57:3',
    seedField: 'seed',
    workflow: {
      '9': { inputs: { filename_prefix: 'z-image-turbo', images: ['57:8', 0] }, class_type: 'SaveImage', _meta: { title: '保存图像' } },
      '57:30': { inputs: { clip_name: 'qwen_3_4b.safetensors', type: 'lumina2', device: 'default' }, class_type: 'CLIPLoader', _meta: { title: '加载CLIP' } },
      '57:29': { inputs: { vae_name: 'ae.safetensors' }, class_type: 'VAELoader', _meta: { title: '加载VAE' } },
      '57:33': { inputs: { conditioning: ['57:27', 0] }, class_type: 'ConditioningZeroOut', _meta: { title: '条件零化' } },
      '57:8': { inputs: { samples: ['57:3', 0], vae: ['57:29', 0] }, class_type: 'VAEDecode', _meta: { title: 'VAE解码' } },
      '57:28': { inputs: { unet_name: 'z_image_turbo_bf16.safetensors', weight_dtype: 'default' }, class_type: 'UNETLoader', _meta: { title: 'UNet加载器' } },
      '57:27': { inputs: { text: '', clip: ['57:30', 0] }, class_type: 'CLIPTextEncode', _meta: { title: 'CLIP文本编码' } },
      '57:13': { inputs: { width: 512, height: 512, batch_size: 1 }, class_type: 'EmptySD3LatentImage', _meta: { title: '空Latent图像（SD3）' } },
      '57:11': { inputs: { shift: 3, sampling: 'flow', model: ['57:28', 0] }, class_type: 'ModelSamplingAuraFlow', _meta: { title: '采样算法（AuraFlow）' } },
      '57:3': {
        inputs: {
          seed: 0,
          steps: 8,
          cfg: 1,
          sampler_name: 'res_multistep',
          scheduler: 'simple',
          denoise: 1,
          model: ['57:11', 0],
          positive: ['57:27', 0],
          negative: ['57:33', 0],
          latent_image: ['57:13', 0],
        },
        class_type: 'KSampler',
        _meta: { title: 'K采样器' },
      },
    },
  },
  {
    id: 'h3',
    name: 'H3 高清',
    lang: 'en',
    style: STYLE_EN,
    promptNode: '2',
    promptField: 'prompt',
    seedNode: '3',
    seedField: 'seed',
    workflow: {
      '1': {
        inputs: {
          diffusion_model: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
          text_encoder: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
          video_vae: 'minimax_h3_video_vae_int8_convrot.safetensors',
          turbo_lora: 'None',
        },
        class_type: 'H3StudioModels',
        _meta: { title: 'H3 • Models' },
      },
      '2': {
        inputs: { prompt: '', aspect_ratio: '1:1 square', megapixels: 1, width: 1024, height: 1024, models: ['1', 0] },
        class_type: 'H3StudioGenerate',
        _meta: { title: 'H3 • Text to Image' },
      },
      '3': {
        inputs: { steps: 50, seed: 0, sampler_name: 'er_sde', scheduler: 'simple', image_job: ['2', 0] },
        class_type: 'H3StudioRender',
        _meta: { title: 'H3 • Render Image' },
      },
      '4': { inputs: { filename_prefix: 'H3_GENERATE', images: ['3', 0] }, class_type: 'SaveImage', _meta: { title: '保存图像' } },
    },
  },
]
