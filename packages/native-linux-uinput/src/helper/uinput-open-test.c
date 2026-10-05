#include <assert.h>
#include <errno.h>
#include <fcntl.h>
#include <stddef.h>
#include <string.h>

#include "uinput-open.h"

struct open_result {
  int fd;
  int error;
};

static struct open_result results[OC_UINPUT_OPEN_MAX_ATTEMPTS];
static unsigned int result_count;
static unsigned int open_count;
static unsigned int wait_count;
static unsigned int waits[OC_UINPUT_OPEN_MAX_ATTEMPTS];

static int scripted_open(const char *path, int flags) {
  struct open_result result;

  assert(strcmp(path, "/test/uinput") == 0);
  assert(flags == (O_RDWR | O_NONBLOCK));
  assert(open_count < result_count);
  result = results[open_count++];
  if (result.fd < 0) {
    errno = result.error;
  }
  return result.fd;
}

static void scripted_wait(unsigned int milliseconds) {
  assert(wait_count < OC_UINPUT_OPEN_MAX_ATTEMPTS);
  waits[wait_count++] = milliseconds;
  errno = EINTR;
}

static void reset_script(const struct open_result *script, unsigned int count) {
  memcpy(results, script, count * sizeof(script[0]));
  result_count = count;
  open_count = 0;
  wait_count = 0;
}

static void test_success_after_transient_failures(void) {
  const struct open_result script[] = {
      {-1, ENOENT}, {-1, EACCES}, {42, 0},
  };
  unsigned int attempts = 0;

  reset_script(script, sizeof(script) / sizeof(script[0]));
  assert(oc_uinput_open_with_retry("/test/uinput", scripted_open,
                                   scripted_wait, &attempts) == 42);
  assert(attempts == 3);
  assert(open_count == 3);
  assert(wait_count == 2);
  assert(waits[0] == 10);
  assert(waits[1] == 20);
}

static void test_persistent_failure_stops_at_bound(void) {
  const struct open_result script[] = {
      {-1, EACCES}, {-1, EACCES}, {-1, EACCES}, {-1, EACCES}, {-1, EACCES},
  };
  unsigned int attempts = 0;

  reset_script(script, sizeof(script) / sizeof(script[0]));
  errno = 0;
  assert(oc_uinput_open_with_retry("/test/uinput", scripted_open,
                                   scripted_wait, &attempts) == -1);
  assert(errno == EACCES);
  assert(attempts == OC_UINPUT_OPEN_MAX_ATTEMPTS);
  assert(open_count == OC_UINPUT_OPEN_MAX_ATTEMPTS);
  assert(wait_count == OC_UINPUT_OPEN_MAX_ATTEMPTS - 1);
  assert(waits[0] == 10);
  assert(waits[1] == 20);
  assert(waits[2] == 40);
  assert(waits[3] == 40);
}

static void test_other_errors_are_not_retried(void) {
  const struct open_result script[] = {{-1, EPERM}};
  unsigned int attempts = 0;

  reset_script(script, sizeof(script) / sizeof(script[0]));
  errno = 0;
  assert(oc_uinput_open_with_retry("/test/uinput", scripted_open,
                                   scripted_wait, &attempts) == -1);
  assert(errno == EPERM);
  assert(attempts == 1);
  assert(open_count == 1);
  assert(wait_count == 0);
}

int main(void) {
  test_success_after_transient_failures();
  test_persistent_failure_stops_at_bound();
  test_other_errors_are_not_retried();
  return 0;
}
