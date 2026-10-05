#ifndef OPENCONTROLLER_UINPUT_OPEN_H
#define OPENCONTROLLER_UINPUT_OPEN_H

#include <errno.h>
#include <fcntl.h>
#include <time.h>

#define OC_UINPUT_OPEN_MAX_ATTEMPTS 5
#define OC_UINPUT_OPEN_INITIAL_BACKOFF_MS 10
#define OC_UINPUT_OPEN_MAX_BACKOFF_MS 40

typedef int (*oc_uinput_open_fn)(const char *path, int flags);
typedef void (*oc_uinput_wait_fn)(unsigned int milliseconds);

static unsigned int oc_uinput_open_backoff_ms(unsigned int failed_attempt) {
  unsigned int delay = OC_UINPUT_OPEN_INITIAL_BACKOFF_MS;

  while (failed_attempt > 1 && delay < OC_UINPUT_OPEN_MAX_BACKOFF_MS) {
    delay *= 2;
    failed_attempt--;
  }

  return delay > OC_UINPUT_OPEN_MAX_BACKOFF_MS
             ? OC_UINPUT_OPEN_MAX_BACKOFF_MS
             : delay;
}

static int oc_uinput_open_with_retry(const char *path, oc_uinput_open_fn open_fn,
                                     oc_uinput_wait_fn wait_fn,
                                     unsigned int *attempt_count) {
  unsigned int attempt;

  for (attempt = 1; attempt <= OC_UINPUT_OPEN_MAX_ATTEMPTS; attempt++) {
    int fd = open_fn(path, O_RDWR | O_NONBLOCK);
    int open_error;

    if (attempt_count != NULL) {
      *attempt_count = attempt;
    }

    if (fd >= 0) {
      return fd;
    }

    open_error = errno;
    if ((open_error != ENOENT && open_error != EACCES) ||
        attempt == OC_UINPUT_OPEN_MAX_ATTEMPTS) {
      errno = open_error;
      return -1;
    }

    wait_fn(oc_uinput_open_backoff_ms(attempt));
  }

  errno = EIO;
  return -1;
}

static void oc_uinput_wait_for_backoff(unsigned int milliseconds) {
  struct timespec delay;
  struct timespec remaining;

  delay.tv_sec = (time_t)(milliseconds / 1000);
  delay.tv_nsec = (long)(milliseconds % 1000) * 1000000L;
  while (nanosleep(&delay, &remaining) < 0 && errno == EINTR) {
    delay = remaining;
  }
}

static int oc_system_uinput_open(const char *path, int flags) {
  return open(path, flags);
}

static int oc_uinput_open_device(const char *path, unsigned int *attempt_count) {
  return oc_uinput_open_with_retry(path, oc_system_uinput_open,
                                   oc_uinput_wait_for_backoff, attempt_count);
}

#endif
