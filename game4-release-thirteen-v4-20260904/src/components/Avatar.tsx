import Image from 'next/image';

type AvatarProps = {
  /** 注册时发的 emoji,永远不为空 —— 没上传过图、或图挂了的时候显示它 */
  emoji: string;
  /** 自定义头像地址,来自各接口的 avatarUrl 字段;null 表示没传过 */
  url?: string | null;
  /** 外框样式:尺寸、圆角、底色、emoji 字号都在这里给,和改造前那一坨 span 的类名一致 */
  className?: string;
  /** 给读屏用。留空表示这个头像纯装饰(旁边already有名字),会被标记为 aria-hidden */
  alt?: string;
};

/**
 * 站内统一的头像渲染。
 *
 * 存在的意义是把"有图用图、没图用 emoji"这个判断收在一处 —— 头像出现在
 * 底部导航、我的、好友列表、聊天气泡、好友申请横幅、管理后台六个地方,
 * 散着写迟早漏掉一个,表现是某个角落永远还是 emoji。
 *
 * 用 `unoptimized`:图片是 256×256 的 WebP(十几 KB),再走一趟 Next 的图片优化器
 * 只会多一次服务端回源,省不下任何字节。
 */
export default function Avatar({ emoji, url, className = '', alt = '' }: AvatarProps) {
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden ${className}`}
      aria-hidden={alt ? undefined : true}
    >
      {url
        ? <Image src={url} alt={alt} fill sizes="96px" unoptimized className="object-cover" />
        : emoji}
    </span>
  );
}
