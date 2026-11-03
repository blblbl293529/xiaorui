import unittest
from workouts import BASE, workouts


class WorkoutTests(unittest.TestCase):
    def test_duration_and_topic_attached_to_same_work_and_links_restricted(self):
        ids = [str(7703948619674664000 + n) for n in range(6)]
        def card(i, time, title, host=BASE):
            return f'<a href="{host}{ids[i]}"><span>{time}</span></a><a href="{host}{ids[i]}"><h2>{title}</h2></a>'
        html = (card(0, '10:00', '办公室工位跟练') + card(1, '10:01', '办公室工位跟练')
                + card(2, '', '工位跟练 5分钟') + card(3, '00:30', '长途旅行')
                + card(4, '01:00', '工位锻炼', 'https://outside.example/m/video/')
                + card(5, '00:00', '工位小练习'))
        rows = workouts('office', lambda url: html.encode())
        dynamic = [x for x in rows if x['url'].split('/')[-1] in ids]
        self.assertEqual([x['url'].split('/')[-1] for x in dynamic], [ids[0]])
        self.assertEqual(dynamic[0]['durationSeconds'], 600)

    def test_missing_public_cards_never_pass_off_old_video_as_just_published(self):
        for topic in ('office', 'glutes', 'stretch'):
            rows = workouts(topic, lambda url: b'<html></html>')
            self.assertEqual(len(rows), 1)
            self.assertTrue(0 < rows[0]['durationSeconds'] <= 600)
            self.assertEqual(rows[0]['workoutTopic'], topic)
