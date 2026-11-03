(() => {
  'use strict';
  const recipient = '1311926106@qq.com';
  const subject = '小睿：对方关爱了你一下';
  const button = document.getElementById('care-send');
  const status = document.getElementById('care-status');
  const fallback = document.getElementById('care-mail');
  const address = document.getElementById('care-address');
  let busy = false;
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true; button.disabled = true;
    fallback.hidden = true; fallback.removeAttribute('href');
    let timer;
    try {
      if (!navigator.geolocation) throw new Error('no-location');
      status.textContent = '正在获取当前位置…';
      const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }));
      const { latitude, longitude } = pos.coords;
      if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
          !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new Error('no-location');
      const lat = latitude.toFixed(5), lon = longitude.toFixed(5);
      const note = address.value.trim().slice(0, 100);
      const body = ['对方关爱了你一下。', note && '地点备注：' + note,
        '纬度：' + lat + '，经度：' + lon,
        '在地图中查看：https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lon + '#map=17/' + lat + '/' + lon].filter(Boolean).join('\n');
      fallback.href = 'mailto:' + recipient + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      status.textContent = '正在提交关爱邮件…';
      const ctrl = new AbortController();
      timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch('https://formsubmit.co/ajax/' + recipient, {
        method: 'POST', credentials: 'omit', cache: 'no-store', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ _subject: subject, message: body })
      });
      const data = await res.json();
      if (!res.ok || String(data.success) !== 'true') throw new Error('relay');
      status.textContent = '关爱已提交给邮件服务。首次使用需收件人在 QQ 邮箱确认激活，请也查看垃圾箱。';
      fallback.removeAttribute('href'); address.value = '';
    } catch (e) {
      if (fallback.hasAttribute('href')) {
        status.textContent = '未能确认邮件服务已受理。可打开手机邮箱，核对后发送。';
        fallback.hidden = false;
      } else {
        status.textContent = e.code === 1 ? '未获定位权限，没有发送邮件。允许此网站使用位置后可重试。' : '未能获取位置，没有发送邮件。请检查定位服务后重试。';
      }
    } finally {
      clearTimeout(timer); busy = false; button.disabled = false;
    }
  });
  window.addEventListener('pagehide', () => { fallback.removeAttribute('href'); fallback.hidden = true; });
})();