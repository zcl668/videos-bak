// ========== 提取音频链接（与Python版本完全一致）==========
let playUrl = '暂无音频'

// 方法1：匹配完整格式的音频链接（注意JS中不需要双重转义）
const pattern = /https?:\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi
const matches = data.match(pattern)

if (matches && matches.length > 0) {
  playUrl = `LoveQ音频$${matches[0]}`
  console.log('找到音频:', matches[0])
}

// 方法2：匹配协议相对路径的版本
if (!playUrl || playUrl === '暂无音频') {
  const patternRel = /\/\/dl2\.loveq\.cn:8090\/live\/program\/\d+\/\d+\.mp3\?sign=[a-f0-9]+&timestamp=\d+/gi
  const matchesRel = data.match(patternRel)
  if (matchesRel && matchesRel.length > 0) {
    playUrl = `LoveQ音频$https:${matchesRel[0]}`
    console.log('找到相对路径音频:', matchesRel[0])
  }
}

// 方法3：从audio或source标签中提取
if (!playUrl || playUrl === '暂无音频') {
  $('audio, source').each((_, tag) => {
    const src = $(tag).attr('src') || ''
    if (src && src.includes('dl2.loveq.cn')) {
      // 检查是否符合 .mp3? 格式，且包含 sign= 和 timestamp=
      const mp3Check = /\.mp3\?/i.test(src)
      if (mp3Check && src.includes('sign=') && src.includes('timestamp=')) {
        let audioSrc = src
        if (audioSrc.startsWith('//')) {
          playUrl = `LoveQ音频$https:${audioSrc}`
        } else {
          playUrl = `LoveQ音频$${audioSrc}`
        }
        console.log('从标签找到音频:', audioSrc)
        return false // 停止遍历
      }
    }
  })
}