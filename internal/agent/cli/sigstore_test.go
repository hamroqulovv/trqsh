package cli

import (
	"regexp"
	"testing"
)

func TestReleaseCertificateIdentity(t *testing.T) {
	identity := regexp.MustCompile(releaseCertIdentityRegexp)
	for _, tc := range []struct {
		name string
		url  string
		want bool
	}{
		{"current owner", "https://github.com/algorithco/trqsh/.github/workflows/release.yml@refs/tags/v0.2.2", true},
		{"new owner", "https://github.com/trqsh-tunnel/trqsh/.github/workflows/release.yml@refs/tags/v0.2.4", true},
		{"CLI packages", "https://github.com/trqsh-tunnel/trqsh/.github/workflows/release.yml@refs/tags/package-v0.2.4", true},
		{"previous owner", "https://github.com/uzcreator/trqsh/.github/workflows/release.yml@refs/tags/v0.2.1", true},
		{"different owner", "https://github.com/other/trqsh/.github/workflows/release.yml@refs/tags/v0.2.2", false},
		{"artifact repo", "https://github.com/algorithco/trqshcli/.github/workflows/release.yml@refs/tags/v0.2.2", false},
		{"different workflow", "https://github.com/algorithco/trqsh/.github/workflows/ci.yml@refs/tags/v0.2.2", false},
		{"branch build", "https://github.com/algorithco/trqsh/.github/workflows/release.yml@refs/heads/main", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := identity.MatchString(tc.url); got != tc.want {
				t.Fatalf("release identity %q accepted = %v, want %v", tc.url, got, tc.want)
			}
		})
	}
}
